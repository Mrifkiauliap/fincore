import { BaseProcessor } from "@/processors/base.processor";
import { FinanceGuardrail, GroqWhisperProvider } from "@fincore/ai";
import getConfig from "@fincore/config";
import { aiProcessingLogs, getDb, rawMessages } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";

// ── File size limits ──────────────────────────────────────────────────────────
const MB = 1024 * 1024;
const VOICE_REJECT_THRESHOLD = 5 * MB; // reject voice notes larger than 5 MB

interface VoiceTranscriptionJobData {
  rawMessageId: string;
  userId: string;
  from: string;
  mediaUrl: string | null;
  mediaMimetype: string;
  caption?: string | null; // user's text caption alongside the voice note
}

import { StorageProvider } from "@fincore/storage";

@Injectable()
export class VoiceTranscriptionProcessor extends BaseProcessor {
  readonly queueName = QueueName.VOICE_TRANSCRIPTION;

  private readonly whisper = new GroqWhisperProvider();
  private readonly storageProvider = new StorageProvider();

  constructor() {
    super("processor:voice-transcription");
  }

  async process(job: Job<VoiceTranscriptionJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();

    if (!data.mediaUrl) {
      this.logger.warn(
        { rawMessageId: data.rawMessageId },
        "No mediaUrl provided for voice transcription, skipping",
      );
      return;
    }

    // ── 1. Download audio from WAHA ─────────────────────────────────────────
    this.logger.info(
      { rawMessageId: data.rawMessageId, mediaUrl: data.mediaUrl },
      "Downloading voice audio from WAHA",
    );

    const audioBuffer = await this.downloadMedia(data.mediaUrl);
    const fileSizeBytes = audioBuffer.length;

    this.logger.info(
      { rawMessageId: data.rawMessageId, bufferSize: fileSizeBytes },
      "Audio downloaded",
    );

    // ── 1.5. File size validation ───────────────────────────────────────────
    if (fileSizeBytes > VOICE_REJECT_THRESHOLD) {
      await db
        .update(rawMessages)
        .set({
          mediaSize: fileSizeBytes,
          processingStatus: "failed",
          processingError: "Voice note too large (>5MB)",
        })
        .where(eq(rawMessages.id, data.rawMessageId));

      await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
        chatId: data.from,
        text: "Voice note terlalu panjang/besar (>5MB). Kirim pesan suara yang lebih singkat ya, cukup sebutkan transaksinya saja 🙏",
      });
      return;
    }

    // ── 1.6. Save media to local storage ──────────────────────────────────
    const storagePath = await this.storageProvider.saveMedia(
      audioBuffer,
      data.mediaMimetype,
    );

    await db
      .update(rawMessages)
      .set({ storagePath, mediaSize: fileSizeBytes })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 2. Transcribe via Groq Whisper ──────────────────────────────────────
    const startTime = Date.now();
    try {
      const result = await this.whisper.transcribeVoice(
        audioBuffer,
        data.mediaMimetype,
      );
      const durationMs = Date.now() - startTime;

      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "transcription",
        status: "done",
        provider: "groq",
        durationMs,
        inputSnapshot: { storagePath },
        outputSnapshot: { transcript: result.transcript },
      });

      this.logger.info(
        {
          rawMessageId: data.rawMessageId,
          transcriptLength: result.transcript.length,
          language: result.language,
          durationSeconds: result.durationSeconds,
          durationMs,
        },
        "Voice transcription complete",
      );

      if (!result.transcript.trim()) {
        this.logger.warn(
          { rawMessageId: data.rawMessageId },
          "Empty transcript, skipping AI extraction",
        );
        await db
          .update(rawMessages)
          .set({ processingStatus: "skipped" })
          .where(eq(rawMessages.id, data.rawMessageId));
        return;
      }

      // ── 3. Guardrail Check ──────────────────────────────────────────────────
      const fullContent = data.caption?.trim()
        ? `${result.transcript}\n[Catatan user: ${data.caption}]`
        : result.transcript;

      const guardrail = new FinanceGuardrail();
      const intentResult = await guardrail.detectIntent(fullContent);

      if (!guardrail.isAllowed(intentResult.intent)) {
        this.logger.info(
          { rawMessageId: data.rawMessageId, intent: intentResult.intent },
          "Voice note is out of scope, rejecting and deleting media",
        );

        // Delete the media file
        await this.storageProvider.deleteMedia(storagePath);

        // Update DB
        await db
          .update(rawMessages)
          .set({
            processingStatus: "failed",
            storagePath: null,
            processingError: "Out of scope voice note",
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        // Reply to user
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: data.from,
          text: guardrail.getOutOfScopeReply(),
        });
        return;
      }

      // ── 4. Enqueue transcript for AI extraction ─────────────────────────────
      await enqueue(QueueName.AI_EXTRACTION, JobName.EXTRACT_TRANSACTION, {
        rawMessageId: data.rawMessageId,
        userId: data.userId,
        from: data.from,
        sourceType: MessageType.VOICE,
        content: fullContent,
      });

      this.logger.info(
        { rawMessageId: data.rawMessageId },
        "Transcript enqueued for AI extraction",
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "transcription",
        status: "failed",
        provider: "groq",
        durationMs,
        inputSnapshot: { storagePath },
        error: err?.message || String(err),
      });
      throw err;
    }
  }

  /**
   * Download media from WAHA. Supports both absolute URLs and relative paths.
   */
  private async downloadMedia(mediaUrl: string): Promise<Buffer> {
    let url = mediaUrl;

    // If relative path, prefix with WAHA_BASE_URL
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
