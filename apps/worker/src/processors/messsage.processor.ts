import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, rawMessages, users } from "@fincore/db";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";

interface IncomingMessageJobData {
  waMessageId: string;
  from: string;
  senderPhone: string;
  type: MessageType;
  body: string | null;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaSize: number | null;
  rawPayload: unknown;
  timestamp: number;
  session: string;
  skipProcessing?: boolean;
}

/**
 * In-process set to guard against concurrent jobs for the same waMessageId.
 * DB-level unique constraint on waMessageId serves as the second line of defense
 * for cross-process / cross-restart deduplication.
 */
const inFlightMessages = new Set<string>();

@Injectable()
export class IncomingMessageProcessor extends BaseProcessor {
  readonly queueName = QueueName.INCOMING_MESSAGE;

  constructor() {
    super("processor:incoming-message");
  }

  async process(job: Job<IncomingMessageJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();

    if (inFlightMessages.has(data.waMessageId)) {
      this.logger.warn(
        { waMessageId: data.waMessageId },
        "Duplicate waMessageId in-flight, skipping",
      );
      return;
    }
    inFlightMessages.add(data.waMessageId);

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, data.senderPhone))
        .limit(1);

      if (!user) {
        this.logger.warn(
          { phone: data.senderPhone },
          "Received message from unregistered user in message.processor. Should have been blocked by webhook.",
        );
        return;
      }

      // ── Onboarding Surprise ──
      // Kirim pesan sambutan panjang jika user baru pertama kali pakai bot ini (setelah daftar)
      if (!user.onboardedAt) {
        const prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
        const welcomeMessage =
          `Halo *${user.name}*! Selamat datang di *FinCore* 🎉\n\n` +
          `Saya asisten keuangan pribadimu via WhatsApp.\n\n` +
          `Berikut cara menggunakannya:\n` +
          `💬 Ketik transaksi: _"Makan siang 35rb GoPay"_\n` +
          `🎤 Kirim voice note: _"Tadi bayar bensin 50 ribu"_\n` +
          `📸 Foto struk belanja dan kirimkan ke sini\n\n` +
          `Ketik ${prefix}bantuan untuk panduan lengkap.\n\n` +
          `Yuk mulai catat keuanganmu! 💪`;

        await sendWaMessage(data.from, welcomeMessage);

        await db
          .update(users)
          .set({ onboardedAt: new Date() })
          .where(eq(users.id, user.id));
      }

      const inserted = await db
        .insert(rawMessages)
        .values({
          userId: user.id,
          waMessageId: data.waMessageId,
          from: data.from,
          type: data.type,
          body: data.body,
          mediaUrl: data.mediaUrl,
          mediaMimetype: data.mediaMimetype,
          mediaSize: data.mediaSize ?? undefined,
          rawPayload: data.rawPayload as Record<string, unknown>,
          processingStatus: data.skipProcessing ? "skipped" : "processing",
          receivedAt: new Date(data.timestamp * 1000),
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        this.logger.warn(
          { waMessageId: data.waMessageId },
          "Duplicate waMessageId in DB, skipping",
        );
        return;
      }

      const rawMessage = inserted[0];

      this.logger.info(
        {
          rawMessageId: rawMessage.id,
          waMessageId: data.waMessageId,
          type: data.type,
        },
        "Raw message saved",
      );

      if (data.skipProcessing) {
        this.logger.info(
          { waMessageId: data.waMessageId },
          "Skipping processing as requested (e.g. media without prefix)",
        );
        return;
      }

      switch (data.type) {
        case MessageType.VOICE:
          await enqueue(
            QueueName.VOICE_TRANSCRIPTION,
            JobName.TRANSCRIBE_VOICE,
            {
              rawMessageId: rawMessage.id,
              userId: user.id,
              from: data.from,
              mediaUrl: data.mediaUrl,
              mediaMimetype: data.mediaMimetype ?? "audio/ogg; codecs=opus",
              caption: data.body ?? null,
            },
          );
          break;

        case MessageType.IMAGE:
        case MessageType.DOCUMENT:
          await enqueue(QueueName.IMAGE_OCR, JobName.OCR_IMAGE, {
            rawMessageId: rawMessage.id,
            userId: user.id,
            from: data.from,
            mediaUrl: data.mediaUrl,
            mediaMimetype:
              data.mediaMimetype ??
              (data.mediaUrl?.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "image/jpeg"),
            caption: data.body ?? null,
          });
          break;

        case MessageType.TEXT:
          if (data.body && data.body.trim().length > 0) {
            let targetType = MessageType.TEXT;
            let mediaUrl: string | null = null;
            let mediaMimetype: string | null = null;

            // Cek apakah ini reply ke pesan sebelumnya
            const payloadObj = data.rawPayload as any;
            const replyToId = payloadObj?.payload?.replyTo;

            if (replyToId) {
              const [quotedMsg] = await db
                .select()
                .from(rawMessages)
                .where(eq(rawMessages.waMessageId, replyToId))
                .limit(1);

              if (
                quotedMsg &&
                (quotedMsg.type === MessageType.VOICE ||
                  quotedMsg.type === MessageType.IMAGE ||
                  quotedMsg.type === MessageType.DOCUMENT ||
                  quotedMsg.type === MessageType.VIDEO)
              ) {
                targetType = quotedMsg.type as MessageType;
                mediaUrl = quotedMsg.mediaUrl;
                mediaMimetype = quotedMsg.mediaMimetype;
                this.logger.info(
                  { replyToId, targetType },
                  "Extracted quoted media from reply",
                );
              }
            }

            if (targetType === MessageType.VOICE && mediaUrl) {
              await enqueue(
                QueueName.VOICE_TRANSCRIPTION,
                JobName.TRANSCRIBE_VOICE,
                {
                  rawMessageId: rawMessage.id, // Gunakan ID pesan text baru
                  userId: user.id,
                  from: data.from,
                  mediaUrl: mediaUrl,
                  mediaMimetype: mediaMimetype ?? "audio/ogg; codecs=opus",
                  caption: data.body, // Ini adalah prefix/command yang diketik user
                },
              );
            } else if (
              (targetType === MessageType.IMAGE ||
                targetType === MessageType.DOCUMENT) &&
              mediaUrl
            ) {
              await enqueue(QueueName.IMAGE_OCR, JobName.OCR_IMAGE, {
                rawMessageId: rawMessage.id,
                userId: user.id,
                from: data.from,
                mediaUrl: mediaUrl,
                mediaMimetype: mediaMimetype ?? "image/jpeg",
                caption: data.body,
              });
            } else {
              await enqueue(
                QueueName.AI_EXTRACTION,
                JobName.EXTRACT_TRANSACTION,
                {
                  rawMessageId: rawMessage.id,
                  userId: user.id,
                  from: data.from,
                  sourceType: MessageType.TEXT,
                  content: data.body,
                },
              );
            }
          }
          break;

        default:
          this.logger.warn({ type: data.type }, "Unhandled message type");
      }
    } finally {
      inFlightMessages.delete(data.waMessageId);
    }
  }
}
