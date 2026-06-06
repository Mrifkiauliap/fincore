import { downloadMedia } from "@/lib/media-downloader";
import { BaseProcessor } from "@/processors/base.processor";
import { GeminiVisionProvider } from "@fincore/ai";
import { aiProcessingLogs, getDb, rawMessages } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
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

@Injectable()
export class ImageOcrProcessor extends BaseProcessor {
  readonly queueName = QueueName.IMAGE_OCR;

  private readonly geminiVision = new GeminiVisionProvider();
  private readonly storageProvider = new StorageProvider();

  constructor() {
    super("processor:image-ocr");
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

    // ── 2. OCR via Gemini Vision ────────────────────────────────────
    const effectiveMimetype = this.resolveEffectiveMimetype(
      isPdf ? data.mediaMimetype : "image/jpeg",
    );

    const startTime = Date.now();
    try {
      const result = await this.geminiVision.analyzeReceipt(
        processBuffer,
        effectiveMimetype,
      );
      const durationMs = Date.now() - startTime;

      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ocr",
        status: "done",
        provider: "gemini",
        durationMs,
        inputSnapshot: { storagePath },
        outputSnapshot: { extractedText: result.extractedText },
      });

      logger.info(
        {
          rawMessageId: data.rawMessageId,
          textLength: result.extractedText.length,
          provider: result.provider,
          durationMs,
        },
        "OCR complete",
      );

      if (!result.extractedText.trim()) {
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
        ? `${result.extractedText}\n[Catatan user: ${data.caption}]`
        : result.extractedText;

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
      const durationMs = Date.now() - startTime;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ocr",
        status: "failed",
        provider: "gemini",
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
