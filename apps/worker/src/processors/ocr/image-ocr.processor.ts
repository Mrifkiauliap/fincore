import { downloadMedia } from "@/lib/media-downloader";
import { BaseProcessor } from "@/processors/base.processor";
import { CircuitBreaker } from "@/lib/circuit-breaker";
import { GeminiVisionProvider, SumopodVisionProvider } from "@fincore/ai";
import { aiProcessingLogs, getDb, rawMessages } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { checkGuardrail } from "./ocr-guardrail";

const MB = 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD = 2.5 * MB;
const IMAGE_REJECT_THRESHOLD = 5 * MB;
const PDF_REJECT_THRESHOLD = 10 * MB;

const logger = createLogger("processor:image-ocr");

interface ImageOcrJobData {
  rawMessageId: string;
  userId: string;
  from: string;
  mediaUrl: string | null;
  mediaMimetype: string;
  caption?: string | null;
}

/**
 * Circuit breaker for Gemini Vision OCR.
 * Opens after 5 consecutive failures, cooldown 60 seconds.
 * While open, requests skip directly to Sumopod fallback.
 */
const geminiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  name: "gemini-vision-ocr",
});

@Injectable()
export class ImageOcrProcessor extends BaseProcessor {
  readonly queueName = QueueName.IMAGE_OCR;

  private readonly geminiVision = new GeminiVisionProvider();
  private readonly sumopodVision = new SumopodVisionProvider();
  private readonly storageProvider = new StorageProvider();

  constructor() {
    super("processor:image-ocr");
  }

  /** Custom retry backoff: 5s initial, exponential, max 60s */
  protected workerOptions(): Partial<WorkerOptions> {
    return {
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // 5s → 10s → 20s → 40s → 60s (cap)
          return Math.min(5000 * Math.pow(2, attemptsMade), 60_000);
        },
      },
    };
  }

  async process(job: Job<ImageOcrJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();

    if (!data.mediaUrl) {
      logger.warn(
        { rawMessageId: data.rawMessageId },
        "No mediaUrl provided for image OCR, skipping",
      );
      return;
    }

    // ── 1. Download ──────────────────────────────────────────────────
    logger.info(
      { rawMessageId: data.rawMessageId, mediaUrl: data.mediaUrl },
      "Downloading image from WAHA",
    );

    const imageBuffer = await downloadMedia(data.mediaUrl);
    const fileSizeBytes = imageBuffer.length;

    logger.info(
      { rawMessageId: data.rawMessageId, bufferSize: fileSizeBytes },
      "Image downloaded",
    );

    // ── 1.5. File size validation ────────────────────────────────────
    const isPdf = data.mediaMimetype === "application/pdf";
    if (isPdf) {
      if (fileSizeBytes > PDF_REJECT_THRESHOLD) {
        await db
          .update(rawMessages)
          .set({
            mediaSize: fileSizeBytes,
            processingStatus: "failed",
            processingError: "PDF too large (>10MB)",
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        await sendWaMessage(
          data.from,
          "Ukuran dokumen PDF terlalu besar (>10MB). Mohon kirim dokumen yang lebih kecil ya! 🙏",
        );
        return;
      }
    } else {
      if (fileSizeBytes > IMAGE_REJECT_THRESHOLD) {
        await db
          .update(rawMessages)
          .set({
            mediaSize: fileSizeBytes,
            processingStatus: "failed",
            processingError: "Image too large (>5MB)",
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        await sendWaMessage(
          data.from,
          "Ukuran gambar terlalu besar (>5MB). Mohon kirim gambar yang lebih kecil ya! 🙏",
        );
        return;
      }
    }

    // ── 1.6. Compress if needed ─────────────────────────────────────
    let processBuffer = imageBuffer;
    if (!isPdf && fileSizeBytes > IMAGE_COMPRESS_THRESHOLD) {
      logger.info(
        { rawMessageId: data.rawMessageId, originalSize: fileSizeBytes },
        "Image exceeds 2.5MB, compressing with Sharp",
      );
      processBuffer = await sharp(imageBuffer)
        .resize({
          width: 1920,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      logger.info(
        {
          rawMessageId: data.rawMessageId,
          compressedSize: processBuffer.length,
        },
        "Image compressed",
      );
    }

    // ── 1.7. Save media ─────────────────────────────────────────────
    const storagePath = await this.storageProvider.saveMedia(
      processBuffer,
      data.mediaMimetype,
    );

    await db
      .update(rawMessages)
      .set({ storagePath, mediaSize: fileSizeBytes })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 2. OCR: Gemini (primary) with fallback to Sumopod ───────────
    const effectiveMimetype = this.resolveEffectiveMimetype(
      isPdf ? data.mediaMimetype : "image/jpeg",
    );

    const startTime = Date.now();
    let ocrResult: { extractedText: string; provider: string } | null = null;

    // Determine current attempt (0-indexed in BullMQ)
    const attemptsMade = (job as any).attemptsMade ?? 0;
    const maxAttempts = (job.opts as any)?.attempts ?? 3;
    const isFinalAttempt = attemptsMade >= maxAttempts - 1;

    try {
      // Notify user on retry (attemptsMade > 0 means this is a retry)
      if (attemptsMade === 1) {
        // Second attempt → notify
        sendWaMessage(
          data.from,
          `⏳ OCR masih diproses ulang... (percobaan ke-${attemptsMade + 1}/${maxAttempts}). Mohon tunggu sebentar ya! 🙏`,
        ).catch(() => {});
      }

      // ── Primary: Gemini Vision (with circuit breaker) ────────────
      const isCircuitOpen = geminiCircuitBreaker.isOpen;
      if (isCircuitOpen) {
        logger.warn(
          { rawMessageId: data.rawMessageId },
          "Gemini circuit breaker OPEN — skipping to fallback",
        );
      } else {
        try {
          const result = await geminiCircuitBreaker.execute(() =>
            this.geminiVision.analyzeReceipt(processBuffer, effectiveMimetype),
          );
          ocrResult = {
            extractedText: result.extractedText,
            provider: result.provider,
          };
        } catch (geminiError: any) {
          logger.warn(
            { rawMessageId: data.rawMessageId, err: geminiError?.message },
            "Gemini OCR failed, will try fallback",
          );
          // Don't rethrow yet — try fallback first on final attempt
        }
      }

      // ── Fallback: Sumopod Vision (on final attempt or circuit open) ──
      if (!ocrResult && isFinalAttempt) {
        logger.info(
          { rawMessageId: data.rawMessageId },
          "Final attempt — trying Sumopod Vision fallback",
        );

        try {
          const fallbackResult = await this.sumopodVision.analyzeReceipt(
            processBuffer,
            effectiveMimetype,
          );
          ocrResult = {
            extractedText: fallbackResult.extractedText,
            provider: fallbackResult.provider,
          };
        } catch (fallbackError: any) {
          logger.error(
            { rawMessageId: data.rawMessageId, err: fallbackError?.message },
            "Sumopod fallback OCR also failed",
          );
        }
      }

      // ── Both failed → mark as permanently failed ──────────────────
      if (!ocrResult) {
        const durationMs = Date.now() - startTime;
        const errorMsg =
          "OCR failed: both Gemini and Sumopod fallback exhausted";

        await db.insert(aiProcessingLogs).values({
          rawMessageId: data.rawMessageId,
          step: "ocr",
          status: "failed",
          provider: "gemini+sumopod",
          durationMs,
          inputSnapshot: { storagePath },
          error: errorMsg,
        });

        await db
          .update(rawMessages)
          .set({
            processingStatus: "failed",
            processingError: errorMsg,
            processedAt: new Date(),
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        logger.error({ rawMessageId: data.rawMessageId, durationMs }, errorMsg);
        throw new Error(errorMsg);
      }

      // ── OCR succeeded (either via Gemini or Sumopod) ──────────────
      const durationMs = Date.now() - startTime;

      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ocr",
        status: "done",
        provider: ocrResult.provider,
        durationMs,
        inputSnapshot: { storagePath },
        outputSnapshot: { extractedText: ocrResult.extractedText },
      });

      logger.info(
        {
          rawMessageId: data.rawMessageId,
          textLength: ocrResult.extractedText.length,
          provider: ocrResult.provider,
          durationMs,
        },
        "OCR complete",
      );

      if (!ocrResult.extractedText.trim()) {
        logger.warn(
          { rawMessageId: data.rawMessageId },
          "Empty OCR result, skipping AI extraction",
        );
        await db
          .update(rawMessages)
          .set({ processingStatus: "skipped" })
          .where(eq(rawMessages.id, data.rawMessageId));
        return;
      }

      // ── 3. Guardrail Check ─────────────────────────────────────────
      const fullContent = data.caption?.trim()
        ? `${ocrResult.extractedText}\n[Catatan user: ${data.caption}]`
        : ocrResult.extractedText;

      const allowed = await checkGuardrail(
        data.rawMessageId,
        data.from,
        storagePath,
        fullContent,
      );

      if (!allowed) return;

      // ── 4. Enqueue OCR text for AI extraction ──────────────────────
      await enqueue(QueueName.AI_EXTRACTION, JobName.EXTRACT_TRANSACTION, {
        rawMessageId: data.rawMessageId,
        userId: data.userId,
        from: data.from,
        sourceType: MessageType.IMAGE,
        content: fullContent,
      });

      logger.info(
        { rawMessageId: data.rawMessageId },
        "OCR text enqueued for AI extraction",
      );
    } catch (err: any) {
      // Catch for non-OCR failures (e.g. guardrail, enqueue errors)
      const durationMs = Date.now() - startTime;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ocr",
        status: "failed",
        provider: "system",
        durationMs,
        inputSnapshot: { storagePath },
        error: err?.message || String(err),
      });
      throw err;
    }
  }

  private resolveEffectiveMimetype(
    mimetype: string,
  ): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" {
    const supported: Array<
      "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
    > = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

    if (supported.includes(mimetype as any)) {
      return mimetype as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "application/pdf";
    }
    return "image/jpeg";
  }
}
