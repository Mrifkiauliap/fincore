import { FinanceGuardrail } from "@fincore/ai";
import { BaseProcessor } from "@/processors/base.processor";
import { getDb, rawMessages, trackEvent, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
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

              // ── Deferred VN: reply with context to pending_confirmation ──
              if (
                quotedMsg &&
                quotedMsg.type === MessageType.VOICE &&
                quotedMsg.processingStatus === "pending_confirmation" &&
                data.body?.trim()
              ) {
                const replyLower = data.body.trim().toLowerCase();
                const reanalyzeKws = ["ulangi", "proses ulang", "retry"];

                if (reanalyzeKws.some((kw) => replyLower === kw)) {
                  // User wants to re-transcribe the pending VN
                  logger.info(
                    { replyToId, rawMessageId: quotedMsg.id },
                    "Re-analyze requested for pending_confirmation VN",
                  );
                  await db
                    .update(rawMessages)
                    .set({
                      processingStatus: "processing",
                      processingError: null,
                      processedAt: null,
                    })
                    .where(eq(rawMessages.id, quotedMsg.id));

                  await enqueue(
                    QueueName.VOICE_TRANSCRIPTION,
                    JobName.TRANSCRIBE_VOICE,
                    {
                      rawMessageId: quotedMsg.id,
                      userId: quotedMsg.userId ?? user.id,
                      from: quotedMsg.from,
                      mediaUrl: quotedMsg.mediaUrl,
                      mediaMimetype:
                        quotedMsg.mediaMimetype ?? "audio/ogg; codecs=opus",
                      caption: quotedMsg.body ?? null,
                    },
                  );

                  sendWaMessage(
                    data.from,
                    "🔄 Memproses ulang pesan suara ini...",
                    replyToId,
                  ).catch(() => {});
                  return;
                }

                // User provided context → merge transcript + context → AI extract
                const transcript = quotedMsg.body ?? "";
                const fullContent = `${transcript}\n[Catatan user: ${data.body}]`;

                logger.info(
                  { replyToId, rawMessageId: quotedMsg.id },
                  "Merging deferred VN transcript with user context",
                );

                await db
                  .update(rawMessages)
                  .set({ processingStatus: "processing", body: fullContent })
                  .where(eq(rawMessages.id, quotedMsg.id));

                // Guardrail check with merged content
                const guardrail = new FinanceGuardrail();
                const intentResult = await guardrail.detectIntent(fullContent);

                if (!guardrail.isAllowed(intentResult.intent)) {
                  await db
                    .update(rawMessages)
                    .set({
                      processingStatus: "failed",
                      processingError: "Out of scope voice note",
                    })
                    .where(eq(rawMessages.id, quotedMsg.id));

                  sendWaMessage(
                    data.from,
                    guardrail.getOutOfScopeReply(),
                    replyToId,
                  ).catch(() => {});
                  return;
                }

                // Enqueue AI extraction directly (skip re-transcription!)
                await enqueue(
                  QueueName.AI_EXTRACTION,
                  JobName.EXTRACT_TRANSACTION,
                  {
                    rawMessageId: quotedMsg.id,
                    userId: quotedMsg.userId ?? user.id,
                    from: quotedMsg.from,
                    sourceType: MessageType.VOICE,
                    content: fullContent,
                  },
                );

                sendWaMessage(
                  data.from,
                  "✅ Konteks diterima! Memproses transaksi dari pesan suara...",
                  replyToId,
                ).catch(() => {});
                return;
              }

              // ── Re-analyze: reply "ulangi" to failed/pending_confirmation ──
              const reanalyzeKeywords = ["ulangi", "proses ulang", "retry"];
              const bodyLower = data.body?.trim().toLowerCase() ?? "";
              const isReanalyze = reanalyzeKeywords.some(
                (kw) => bodyLower === kw,
              );

              if (isReanalyze && quotedMsg) {
                if (
                  quotedMsg.processingStatus === "failed" ||
                  quotedMsg.processingStatus === "pending_confirmation"
                ) {
                  logger.info(
                    { replyToId, rawMessageId: quotedMsg.id },
                    "Re-analyze requested for failed/pending message",
                  );

                  // Reset status and re-enqueue based on type
                  if (
                    quotedMsg.type === MessageType.VOICE &&
                    quotedMsg.mediaUrl
                  ) {
                    await db
                      .update(rawMessages)
                      .set({
                        processingStatus: "processing",
                        processingError: null,
                        processedAt: null,
                      })
                      .where(eq(rawMessages.id, quotedMsg.id));

                    await enqueue(
                      QueueName.VOICE_TRANSCRIPTION,
                      JobName.TRANSCRIBE_VOICE,
                      {
                        rawMessageId: quotedMsg.id,
                        userId: quotedMsg.userId ?? user.id,
                        from: quotedMsg.from,
                        mediaUrl: quotedMsg.mediaUrl,
                        mediaMimetype:
                          quotedMsg.mediaMimetype ?? "audio/ogg; codecs=opus",
                        caption: quotedMsg.body ?? null,
                      },
                    );

                    sendWaMessage(
                      data.from,
                      "🔄 Memproses ulang pesan suara ini...",
                      replyToId,
                    ).catch(() => {});
                    return;
                  } else if (
                    (quotedMsg.type === MessageType.IMAGE ||
                      quotedMsg.type === MessageType.DOCUMENT) &&
                    quotedMsg.mediaUrl
                  ) {
                    await db
                      .update(rawMessages)
                      .set({
                        processingStatus: "processing",
                        processingError: null,
                        processedAt: null,
                      })
                      .where(eq(rawMessages.id, quotedMsg.id));

                    await enqueue(QueueName.IMAGE_OCR, JobName.OCR_IMAGE, {
                      rawMessageId: quotedMsg.id,
                      userId: quotedMsg.userId ?? user.id,
                      from: quotedMsg.from,
                      mediaUrl: quotedMsg.mediaUrl,
                      mediaMimetype:
                        quotedMsg.mediaMimetype ??
                        (quotedMsg.mediaUrl?.toLowerCase().endsWith(".pdf")
                          ? "application/pdf"
                          : "image/jpeg"),
                      caption: quotedMsg.body ?? null,
                    });

                    sendWaMessage(
                      data.from,
                      "🔄 Memproses ulang pesan ini...",
                      replyToId,
                    ).catch(() => {});
                    return;
                  } else {
                    sendWaMessage(
                      data.from,
                      "⚠️ Pesan ini tidak bisa diproses ulang (tipe tidak didukung).",
                      replyToId,
                    ).catch(() => {});
                    return;
                  }
                } else {
                  // Message is not failed/pending_confirmation
                  const statusText =
                    quotedMsg.processingStatus === "done"
                      ? "sudah selesai diproses"
                      : quotedMsg.processingStatus === "processing"
                        ? "sedang diproses"
                        : quotedMsg.processingStatus === "pending"
                          ? "masih antri"
                          : `berstatus ${quotedMsg.processingStatus}`;

                  sendWaMessage(
                    data.from,
                    `ℹ️ Pesan ini ${statusText}. Tidak perlu diproses ulang.`,
                    replyToId,
                  ).catch(() => {});
                  return;
                }
              }

              // ── Normal reply-to: extract quoted media ────────────────
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
