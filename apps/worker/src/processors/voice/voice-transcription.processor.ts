import { CircuitBreaker } from "@/lib/circuit-breaker";
import { downloadMedia } from "@/lib/media-downloader";
import { BaseProcessor } from "@/processors/base.processor";
import { FinanceGuardrail, GroqWhisperProvider } from "@fincore/ai";
import { aiProcessingLogs, getDb, rawMessages } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { eq } from "drizzle-orm";

const MB = 1024 * 1024;
const VOICE_REJECT_THRESHOLD = 5 * MB;
const logger = createLogger("processor:voice-transcription");

interface VoiceTranscriptionJobData {
  rawMessageId: string;
  userId: string;
  from: string;
  mediaUrl: string | null;
  mediaMimetype: string;
  caption?: string | null;
}

/**
 * Circuit breaker for Groq Whisper.
 * Opens after 5 consecutive failures, cooldown 60 seconds.
 * While open, requests fail fast and rely on re-analyze flow.
 */
const groqCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  cooldownMs: 60_000,
  name: "groq-whisper",
});

@Injectable()
export class VoiceTranscriptionProcessor extends BaseProcessor {
  readonly queueName = QueueName.VOICE_TRANSCRIPTION;

  private readonly whisper = new GroqWhisperProvider();
  private readonly storageProvider = new StorageProvider();

  constructor() {
    super("processor:voice-transcription");
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

  async process(job: Job<VoiceTranscriptionJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();

    if (!data.mediaUrl) {
      logger.warn(
        { rawMessageId: data.rawMessageId },
        "No mediaUrl provided for voice transcription, skipping",
      );
      return;
    }

    // ── 1. Download audio from WAHA ─────────────────────────────────────────
    logger.info(
      { rawMessageId: data.rawMessageId, mediaUrl: data.mediaUrl },
      "Downloading voice audio from WAHA",
    );

    const audioBuffer = await downloadMedia(data.mediaUrl);
    const fileSizeBytes = audioBuffer.length;

    logger.info(
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

      await sendWaMessage(
        data.from,
        "Voice note terlalu panjang/besar (>5MB). Kirim pesan suara yang lebih singkat ya, cukup sebutkan transaksinya saja 🙏",
      );
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

    // ── 2. Transcribe via Groq Whisper (with circuit breaker) ────────────
    const startTime = Date.now();
    let transcriptResult: { transcript: string; provider: string } | null =
      null;

    // Determine current attempt (0-indexed in BullMQ)
    const attemptsMade = (job as any).attemptsMade ?? 0;
    const maxAttempts = (job.opts as any)?.attempts ?? 3;
    const isFinalAttempt = attemptsMade >= maxAttempts - 1;

    try {
      // Notify user on retry
      if (attemptsMade === 1) {
        sendWaMessage(
          data.from,
          `⏳ Transkripsi suara masih diproses ulang... (percobaan ke-${attemptsMade + 1}/${maxAttempts}). Mohon tunggu sebentar ya! 🙏`,
        ).catch(() => {});
      }

      // ── Primary: Groq Whisper (with circuit breaker) ──────────────────
      const isCircuitOpen = groqCircuitBreaker.isOpen;
      if (isCircuitOpen) {
        logger.warn(
          { rawMessageId: data.rawMessageId },
          "Groq circuit breaker OPEN — will fail on final attempt",
        );
      } else {
        try {
          const result = await groqCircuitBreaker.execute(() =>
            this.whisper.transcribeVoice(audioBuffer, data.mediaMimetype),
          );
          transcriptResult = {
            transcript: result.transcript,
            provider: result.provider,
          };
        } catch (groqError: any) {
          logger.warn(
            { rawMessageId: data.rawMessageId, err: groqError?.message },
            "Groq Whisper failed",
          );
        }
      }

      // ── Both failed → mark as permanently failed ─────────────────────
      if (!transcriptResult) {
        const durationMs = Date.now() - startTime;
        const errorMsg =
          "Voice transcription failed: Groq Whisper exhausted all retries";

        await db.insert(aiProcessingLogs).values({
          rawMessageId: data.rawMessageId,
          step: "transcription",
          status: "failed",
          provider: "groq",
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

      // ── Transcription succeeded ──────────────────────────────────────
      const durationMs = Date.now() - startTime;

      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "transcription",
        status: "done",
        provider: transcriptResult.provider,
        durationMs,
        inputSnapshot: { storagePath },
        outputSnapshot: { transcript: transcriptResult.transcript },
      });

      logger.info(
        {
          rawMessageId: data.rawMessageId,
          transcriptLength: transcriptResult.transcript.length,
          durationMs,
        },
        "Voice transcription complete",
      );

      if (!transcriptResult.transcript.trim()) {
        logger.warn(
          { rawMessageId: data.rawMessageId },
          "Empty transcript, skipping AI extraction",
        );
        await db
          .update(rawMessages)
          .set({ processingStatus: "skipped" })
          .where(eq(rawMessages.id, data.rawMessageId));
        return;
      }

      // ── 3. Deferred Processing: VN without caption → wait for context ──
      const hasCaption = data.caption?.trim();
      if (!hasCaption) {
        logger.info(
          { rawMessageId: data.rawMessageId },
          "Voice note without caption — deferring to pending_confirmation",
        );

        await db
          .update(rawMessages)
          .set({
            processingStatus: "pending_confirmation",
            body: transcriptResult.transcript,
            processedAt: null,
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        await sendWaMessage(
          data.from,
          `🎤 Transkripsi suara:\n\n"${transcriptResult.transcript}"\n\n📝 Balas pesan ini dengan konteks, contoh:\n//catat pake bank jago #utility #server`,
        );

        return;
      }

      // ── 4. Guardrail Check (only for VN with caption / re-processed) ──
      const fullContent = `${transcriptResult.transcript}\n[Catatan user: ${data.caption}]`;

      const guardrail = new FinanceGuardrail();
      const intentResult = await guardrail.detectIntent(fullContent);

      if (!guardrail.isAllowed(intentResult.intent)) {
        logger.info(
          { rawMessageId: data.rawMessageId, intent: intentResult.intent },
          "Voice note is out of scope, rejecting and deleting media",
        );

        await this.storageProvider.deleteMedia(storagePath);

        await db
          .update(rawMessages)
          .set({
            processingStatus: "failed",
            storagePath: null,
            processingError: "Out of scope voice note",
          })
          .where(eq(rawMessages.id, data.rawMessageId));

        await sendWaMessage(data.from, guardrail.getOutOfScopeReply());
        return;
      }

      // ── 5. Enqueue transcript for AI extraction ─────────────────────────
      await enqueue(QueueName.AI_EXTRACTION, JobName.EXTRACT_TRANSACTION, {
        rawMessageId: data.rawMessageId,
        userId: data.userId,
        from: data.from,
        sourceType: MessageType.VOICE,
        content: fullContent,
      });

      logger.info(
        { rawMessageId: data.rawMessageId },
        "Transcript enqueued for AI extraction",
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "transcription",
        status: "failed",
        provider: "system",
        durationMs,
        inputSnapshot: { storagePath },
        error: err?.message || String(err),
      });
      throw err;
    }
  }
}
