import { BaseProcessor } from "@/processors/base.processor";
import { getDb, rawMessages, users } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";

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
        .insert(users)
        .values({ phone: data.senderPhone })
        .onConflictDoUpdate({
          target: users.phone,
          set: { phone: data.senderPhone },
        })
        .returning();

      this.logger.debug(
        { userId: user.id, phone: data.senderPhone },
        "User upserted",
      );

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
          processingStatus: "processing",
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
            mediaMimetype: data.mediaMimetype ?? "image/jpeg",
          });
          break;

        case MessageType.TEXT:
          if (data.body && data.body.trim().length > 0) {
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
          break;

        default:
          this.logger.warn({ type: data.type }, "Unhandled message type");
      }
    } finally {
      inFlightMessages.delete(data.waMessageId);
    }
  }
}
