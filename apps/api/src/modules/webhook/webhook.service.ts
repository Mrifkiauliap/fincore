import {
  WahaMessagePayload,
  WahaWebhookPayload,
  extractPhone,
  mapWahaTypeToMessageType,
} from "@/modules/webhook/waha-payload.dto";
import { FinanceGuardrail, MessageIntent } from "@fincore/ai";
import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";

const logger = createLogger("webhook");

@Injectable()
export class WebhookService {
  private readonly guardrail = new FinanceGuardrail();

  private readonly triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  async handleIncoming(payload: WahaWebhookPayload): Promise<void> {
    if (payload.event !== "message") return;

    logger.info(
      { payload },
      "================ Message received ================  ",
    );

    const msg = payload.payload as WahaMessagePayload;

    // Skip messages sent by the bot itself
    if (msg.fromMe) {
      logger.info(
        "====================== Message from ME =========================",
      );
      return;
    }

    if (getConfig("NODE_ENV") !== "production") {
      logger.info(
        "====================== Message from User =========================",
      );
      logger.info({ msg }, "Message received");
    }

    // ── Trigger prefix check (skip for media messages — they don't have a body) ──
    const isMediaMessage = msg.hasMedia && !!msg.media?.url;
    if (
      this.triggerPrefix &&
      !isMediaMessage &&
      !msg.body?.startsWith(this.triggerPrefix)
    ) {
      logger.debug({ body: msg.body }, "Message skipped — prefix mismatch");
      return;
    }

    const cleanBody = this.triggerPrefix
      ? (msg.body ?? "").slice(this.triggerPrefix.length).trim()
      : (msg.body ?? "");

    const senderPhone = extractPhone(msg.from);

    // ── Extract media info from WAHA payload ─────────────────────────────────
    // WAHA NOWEB engine puts media info under msg.media.{url, mimetype}
    const mediaUrl =
      (msg.media?.url as string | undefined) ?? msg.mediaUrl ?? null;
    let mediaMimetype =
      (msg.media?.mimetype as string | undefined) ??
      msg.mediaContentType ??
      null;

    if (!mediaMimetype && mediaUrl && mediaUrl.toLowerCase().endsWith(".pdf")) {
      mediaMimetype = "application/pdf";
    }

    const messageType = mapWahaTypeToMessageType(
      msg.type,
      msg.hasMedia,
      msg.body,
      mediaMimetype,
    );

    if (!messageType) {
      logger.debug({ type: msg.type }, "Unsupported message type, skipping");
      return;
    }

    logger.info(
      { from: senderPhone, type: messageType, hasMedia: msg.hasMedia },
      "Incoming message",
    );

    // ── Guardrail: check intent for text messages ─────────────────────────────
    if (messageType === MessageType.TEXT && cleanBody.length > 0) {
      const intentResult = await this.guardrail.detectIntent(cleanBody);

      if (!this.guardrail.isAllowed(intentResult.intent)) {
        // Out of scope — enqueue a rejection reply
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: this.guardrail.getOutOfScopeReply(),
          replyTo: msg.id,
        });
        logger.info(
          { intent: intentResult.intent },
          "Message rejected by guardrail",
        );
        return;
      }

      if (intentResult.intent === MessageIntent.GREETING) {
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: this.getGreetingReply(),
          replyTo: msg.id,
        });
        return;
      }

      // QUERY_REPORT goes to report queue
      if (intentResult.intent === MessageIntent.QUERY_REPORT) {
        await enqueue(QueueName.REPORT_GENERATION, JobName.GENERATE_REPORT, {
          from: msg.from,
          senderPhone,
          query: intentResult.extractedQuery ?? cleanBody,
          type: "query",
          rawMessageId: null,
        });

        const queryAck =
          intentResult.ackMessage ?? "Sedang mengecek data keuanganmu...";
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: queryAck,
          replyTo: msg.id,
        });
        return;
      }

      // CONFIRMATION_REPLY — user menjawab ya/tidak untuk transaksi pending
      if (intentResult.intent === MessageIntent.CONFIRMATION_REPLY) {
        await enqueue(QueueName.CONFIRMATION, JobName.CONFIRM_TRANSACTION, {
          chatId: msg.from,
          senderPhone,
          answer: intentResult.extractedQuery ?? cleanBody, // "yes" or "no"
        });
        return;
      }

      // SETUP_RECURRING — user ingin set reminder tagihan berulang
      if (intentResult.intent === MessageIntent.SETUP_RECURRING) {
        await enqueue(QueueName.RECURRING_SETUP, JobName.SETUP_RECURRING, {
          chatId: msg.from,
          senderPhone,
          message: cleanBody,
        });
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: "Sedang menyimpan pengingat tagihan...",
          replyTo: msg.id,
        });
        return;
      }

      // COMMAND — perintah bantuan/help dll
      if (intentResult.intent === MessageIntent.COMMAND) {
        const lowerBody = cleanBody.toLowerCase();
        let reply = "Fitur command ini sedang dibangun! 🚧";
        if (
          lowerBody.startsWith(this.triggerPrefix + "bantuan") ||
          lowerBody.startsWith(this.triggerPrefix + "help")
        ) {
          reply = this.getGreetingReply();
        }
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: reply,
          replyTo: msg.id,
        });
        return;
      }
    }

    // ── Enqueue the raw message for storage + processing ─────────────────────
    await enqueue(
      QueueName.INCOMING_MESSAGE,
      JobName.PROCESS_INCOMING_MESSAGE,
      {
        waMessageId: msg.id,
        from: msg.from,
        senderPhone,
        type: messageType,
        body: cleanBody,
        mediaUrl,
        mediaMimetype,
        mediaSize: msg.mediaSize ?? null,
        rawPayload: payload,
        timestamp: msg.timestamp,
        session: payload.session,
      },
    );

    logger.info({ waMessageId: msg.id, type: messageType }, "Job enqueued");

    // ── Send immediate ack to user ────────────────────────────────────────────
    const ackMessage = this.getAckMessage(messageType as MessageType);
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId: msg.from,
      text: ackMessage,
      replyTo: msg.id,
    });
  }

  // ─── Ack messages per type ────────────────────────────────────────────────
  private getAckMessage(type: MessageType): string {
    const messages: Record<MessageType, string> = {
      [MessageType.TEXT]: "⏳ Mencatat transaksi...",
      [MessageType.VOICE]: "⏳ Sedang mendengarkan voice note...",
      [MessageType.IMAGE]: "⏳ Sedang membaca gambar/struk...",
      [MessageType.DOCUMENT]: "⏳ Sedang membaca dokumen...",
      [MessageType.VIDEO]: "⏳ Sedang memproses video...",
    };
    return messages[type] ?? "⏳ Sedang memproses...";
  }

  private getGreetingReply(): string {
    const hour = new Date().getHours();
    const salam =
      hour < 11
        ? "Selamat pagi"
        : hour < 15
          ? "Selamat siang"
          : hour < 18
            ? "Selamat sore"
            : "Selamat malam";

    return (
      `${salam}! Aku FinCore, asisten keuangan personalmu.\n\n` +
      `Yang bisa kamu lakukan:\n` +
      `• Catat pengeluaran: _"Makan siang 25rb gopay"_\n` +
      `• Catat pemasukan: _"Terima gaji 5jt"_\n` +
      `• Transfer: _"Tf ke Jago 500rb dari BSI, admin 2500"_\n` +
      `• Kirim struk atau voice note\n` +
      `• Tanya: _"Berapa pengeluaranku minggu ini?"_\n\n` +
      `Ketik ${this.triggerPrefix}bantuan untuk panduan lengkap.`
    );
  }
}
