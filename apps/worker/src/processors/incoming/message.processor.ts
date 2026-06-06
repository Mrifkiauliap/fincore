import { BaseProcessor } from "@/processors/base.processor";
import { getDb, rawMessages, trackEvent, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { handleWelcomeMessage } from "./incoming-welcome";

const logger = createLogger("processor:incoming-message");

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
      logger.warn(
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
        logger.warn(
          { phone: data.senderPhone },
          "Received message from unregistered user in message.processor. Should have been blocked by webhook.",
        );
        return;
      }

      // ── Onboarding ──
      if (!user.onboardedAt) {
        await handleWelcomeMessage(
          user.id,
          user.phone,
          data.from,
          user.name ?? user.phone,
        );
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
        logger.warn(
          { waMessageId: data.waMessageId },
          "Duplicate waMessageId in DB, skipping",
        );
        return;
      }

      const rawMessage = inserted[0];

      trackEvent({
        category: "system",
        event: "message.received",
        metadata: { type: data.type, hasMedia: !!data.mediaUrl },
      }).catch(() => {});

      logger.info(
        {
          rawMessageId: rawMessage.id,
          waMessageId: data.waMessageId,
          type: data.type,
        },
        "Raw message saved",
      );

      if (data.skipProcessing) {
        logger.info(
          { waMessageId: data.waMessageId },
          "Skipping processing as requested",
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
                logger.info(
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
                  rawMessageId: rawMessage.id,
                  userId: user.id,
                  from: data.from,
                  mediaUrl: mediaUrl,
                  mediaMimetype: mediaMimetype ?? "audio/ogg; codecs=opus",
                  caption: data.body,
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
          logger.warn({ type: data.type }, "Unhandled message type");
      }
    } finally {
      inFlightMessages.delete(data.waMessageId);
    }
  }
}
