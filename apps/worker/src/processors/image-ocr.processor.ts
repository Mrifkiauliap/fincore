import { BaseProcessor } from "@/processors/base.processor";
import { FinanceGuardrail, GeminiVisionProvider } from "@fincore/ai";
import getConfig from "@fincore/config";
import { aiProcessingLogs, getDb, rawMessages } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";

// ── File size limits ──────────────────────────────────────────────────────────
const MB = 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD = 2.5 * MB;
const IMAGE_REJECT_THRESHOLD = 5 * MB;
const PDF_REJECT_THRESHOLD = 10 * MB;

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
      this.logger.warn(
        { rawMessageId: data.rawMessageId },
        "No mediaUrl provided for image OCR, skipping",
      );
      return;
    }

    // ── 1. Download image/document from WAHA ────────────────────────────────
    this.logger.info(
      { rawMessageId: data.rawMessageId, mediaUrl: data.mediaUrl },
      "Downloading image from WAHA",
    );

    const imageBuffer = await this.downloadMedia(data.mediaUrl);
    const fileSizeBytes = imageBuffer.length;

    this.logger.info(
      { rawMessageId: data.rawMessageId, bufferSize: fileSizeBytes },
      "Image downloaded",
    );

    // ── 1.5. File size validation (gambar only, PDF lewati) ───────────────────
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

        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: data.from,
          text: "Ukuran dokumen PDF terlalu besar (>10MB). Mohon kirim dokumen yang lebih kecil ya! 🙏",
        });
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

        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: data.from,
          text: "Ukuran gambar terlalu besar (>5MB). Mohon kirim gambar yang lebih kecil ya! 🙏",
        });
        return;
      }
    }

    // ── 1.6. Compress gambar jika melebihi threshold (2.5 MB) ─────────────────
    let processBuffer = imageBuffer;
    if (!isPdf && fileSizeBytes > IMAGE_COMPRESS_THRESHOLD) {
      this.logger.info(
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
      this.logger.info(
        {
          rawMessageId: data.rawMessageId,
          compressedSize: processBuffer.length,
        },
        "Image compressed",
      );
    }

    // ── 1.7. Save media to local storage ─────────────────────────────────────
    const storagePath = await this.storageProvider.saveMedia(
      processBuffer,
      data.mediaMimetype,
    );

    await db
      .update(rawMessages)
      .set({ storagePath, mediaSize: fileSizeBytes })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 2. OCR via Gemini Vision ────────────────────────────────────────────
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

      this.logger.info(
        {
          rawMessageId: data.rawMessageId,
          textLength: result.extractedText.length,
          provider: result.provider,
          durationMs,
        },
        "OCR complete",
      );

      if (!result.extractedText.trim()) {
        this.logger.warn(
          { rawMessageId: data.rawMessageId },
          "Empty OCR result, skipping AI extraction",
        );
        await db
          .update(rawMessages)
          .set({ processingStatus: "skipped" })
          .where(eq(rawMessages.id, data.rawMessageId));
        return;
      }

      // ── 3. Guardrail Check ──────────────────────────────────────────────────
      const fullContent = data.caption?.trim()
        ? `${result.extractedText}\n[Catatan user: ${data.caption}]`
        : result.extractedText;

      const guardrail = new FinanceGuardrail();
      const intentResult = await guardrail.detectIntent(fullContent);

      if (!guardrail.isAllowed(intentResult.intent)) {
        this.logger.info(
          { rawMessageId: data.rawMessageId, intent: intentResult.intent },
          "OCR result is out of scope, rejecting and deleting media",
        );

        await this.storageProvider.deleteMedia(storagePath);

        await db
          .update(rawMessages)
          .set({
            processingStatus: "failed",
            storagePath: null,
            processingError: "Out of scope image/document",
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: data.from,
          text: guardrail.getOutOfScopeReply(),
        });
        return;
      }

      // ── 4. Enqueue OCR text for AI extraction ───────────────────────────────
      await enqueue(QueueName.AI_EXTRACTION, JobName.EXTRACT_TRANSACTION, {
        rawMessageId: data.rawMessageId,
        userId: data.userId,
        from: data.from,
        sourceType: MessageType.IMAGE,
        content: fullContent,
      });

      this.logger.info(
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

  /**
   * Resolve effective mimetype for Gemini Vision.
   * Gemini supports: image/jpeg, image/png, image/webp, image/gif, application/pdf.
   */
  private resolveEffectiveMimetype(
    mimetype: string,
  ): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" {
    const supported: Array<
      "image/jpeg" | "image/png" | "image/webp" | "application/pdf"
    > = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

    if (
      supported.includes(
        mimetype as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "application/pdf",
      )
    ) {
      return mimetype as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "application/pdf";
    }
    return "image/jpeg";
  }

  /**
   * Download media from WAHA. Supports both absolute URLs and relative paths.
   */
  private async downloadMedia(mediaUrl: string): Promise<Buffer> {
    let url = mediaUrl;

    if (url.startsWith("/")) {
      url = `${getConfig("WAHA_BASE_URL")}${url}`;
    }

    const response = await axios.get(url, {
      headers: { "X-Api-Key": getConfig("WAHA_API_KEY") },
      responseType: "arraybuffer",
      timeout: 60_000,
    });

    return Buffer.from(response.data);
  }
}
