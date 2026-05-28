import {
  WahaMessagePayload,
  WahaWebhookPayload,
  extractPhone,
  mapWahaTypeToMessageType,
} from "@/modules/webhook/waha-payload.dto";
import { FinanceGuardrail, MessageIntent } from "@fincore/ai";
import getConfig from "@fincore/config";
import { getDb, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { createValkeyConnection, enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

const logger = createLogger("webhook");

@Injectable()
export class WebhookService {
  private readonly guardrail = new FinanceGuardrail();
  private readonly triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
  private readonly valkey = createValkeyConnection();

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

    // ── Extract body ──
    const cleanBody = (msg.body ?? "").trim();

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

    // ── Cek Registrasi User ───────────────────────────────────────────────────
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    const isRegisterCommand = cleanBody
      .toLowerCase()
      .startsWith(this.triggerPrefix + "daftar");

    if (!user) {
      if (isRegisterCommand) {
        // Teruskan ke settings command untuk di-handle registrasinya
        await enqueue(
          QueueName.SETTINGS_COMMAND,
          JobName.PROCESS_SETTINGS_COMMAND,
          {
            chatId: msg.from,
            senderPhone,
            commandText: cleanBody,
          },
        );
      } else {
        // Blokir dan minta daftar
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: `👋 Halo! Kamu belum terdaftar di FinCore.\n\nSilakan daftar terlebih dahulu dengan mengetik:\n*${this.triggerPrefix}daftar [Nama Kamu]*\n\nContoh: *${this.triggerPrefix}daftar Budi*`,
        });
      }
      return;
    }

    // ── Multi-turn: cek pending_action SEBELUM guardrail ─────────────────────────
    // Jika user sedang dalam alur multi-turn (pilih nomor, ya/tidak untuk hapus, dll)
    // routing langsung ke TRANSACTION_COMMAND tanpa melewati guardrail
    if (messageType === MessageType.TEXT && cleanBody.trim().length > 0) {
      const pendingRaw = await this.valkey.get(
        `fincore:pending_action:${msg.from}`,
      );
      if (pendingRaw) {
        await enqueue(
          QueueName.TRANSACTION_COMMAND,
          JobName.PROCESS_TRANSACTION_COMMAND,
          {
            chatId: msg.from,
            senderPhone,
            commandText: cleanBody,
          },
        );
        return;
      }
    }

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

      if (intentResult.intent === MessageIntent.COMMAND) {
        const lowerBody = cleanBody.toLowerCase();
        const p = this.triggerPrefix;

        // /budget
        if (lowerBody.startsWith(p + "budget")) {
          await enqueue(
            QueueName.BUDGET_COMMAND,
            JobName.PROCESS_BUDGET_COMMAND,
            {
              chatId: msg.from,
              senderPhone,
              commandText: cleanBody,
            },
          );
          return;
        }

        // /hapus, /hapus terakhir, /hapus [nama], /konfirmasi
        if (
          lowerBody.startsWith(p + "hapus") ||
          lowerBody.startsWith(p + "konfirmasi")
        ) {
          await enqueue(
            QueueName.TRANSACTION_COMMAND,
            JobName.PROCESS_TRANSACTION_COMMAND,
            { chatId: msg.from, senderPhone, commandText: cleanBody },
          );
          return;
        }

        // /tambah, /lihat
        if (
          lowerBody.startsWith(p + "tambah") ||
          lowerBody.startsWith(p + "lihat")
        ) {
          await enqueue(
            QueueName.CUSTOM_COMMAND,
            JobName.PROCESS_CUSTOM_COMMAND,
            { chatId: msg.from, senderPhone, commandText: cleanBody },
          );
          return;
        }

        // /atur, /settings
        if (
          lowerBody.startsWith(p + "atur") ||
          lowerBody.startsWith(p + "settings")
        ) {
          await enqueue(
            QueueName.SETTINGS_COMMAND,
            JobName.PROCESS_SETTINGS_COMMAND,
            { chatId: msg.from, senderPhone, commandText: cleanBody },
          );
          return;
        }

        // /laporan bulanan
        if (
          lowerBody === p + "laporan bulan" ||
          lowerBody === p + "laporan bulanan"
        ) {
          await enqueue(
            QueueName.MONTHLY_REPORT,
            JobName.GENERATE_MONTHLY_REPORT,
            {
              senderPhone,
            },
          );
          await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
            chatId: msg.from,
            text: "⏳ Sedang merekap laporan bulanan...",
            replyTo: msg.id,
          });
          return;
        }

        // /bantuan, /help
        if (
          lowerBody.startsWith(p + "bantuan") ||
          lowerBody.startsWith(p + "help")
        ) {
          await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
            chatId: msg.from,
            text: this.getGreetingReply(),
            replyTo: msg.id,
          });
          return;
        }

        // Fallback unknown command
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: `Fitur command ini sedang dibangun! 🚧

Ketik ${p}bantuan untuk melihat perintah yang tersedia.`,
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
    const p = this.triggerPrefix;

    return (
      `${salam}! Aku FinCore, asisten keuangan personalmu.\n\n` +
      `*📝 Catat Transaksi:*\n` +
      `• Ketik: _"Makan siang 25rb gopay"_\n` +
      `• Voice note atau foto struk\n\n` +
      `*🗑️ Manajemen Transaksi:*\n` +
      `• \`${p}hapus\` — hapus transaksi terakhir\n` +
      `• \`${p}hapus [nama]\` — cari & hapus transaksi\n` +
      `• \`${p}konfirmasi\` — konfirmasi transaksi pending\n\n` +
      `*💰 Budget:*\n` +
      `• \`${p}budget set [kategori] [nominal]\`\n` +
      `• \`${p}budget cek\` — lihat status budget bulan ini\n\n` +
      `*📊 Laporan:*\n` +
      `• Tanya: _"Berapa pengeluaranku minggu ini?"_\n` +
      `• \`${p}laporan bulanan\`\n\n` +
      `*⚙️ Pengaturan:*\n` +
      `• \`${p}atur timezone Asia/Jakarta\`\n` +
      `• \`${p}tambah metode [nama]\`\n` +
      `• \`${p}tambah kategori [nama] expense\`\n` +
      `• \`${p}lihat metode\` atau \`${p}lihat kategori\``
    );
  }
}
