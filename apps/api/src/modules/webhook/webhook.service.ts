import { DRIZZLE } from "@/modules/database/database.module";
import {
  WahaMessagePayload,
  WahaWebhookPayload,
  mapWahaTypeToMessageType,
} from "@/modules/webhook/waha-payload.dto";
import { FinanceGuardrail, MessageIntent } from "@fincore/ai";
import getConfig from "@fincore/config";
import { getDb, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { createValkeyConnection, enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { extractPhone } from "@fincore/utils";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

const logger = createLogger("webhook");

@Injectable()
export class WebhookService {
  private readonly guardrail = new FinanceGuardrail();
  private readonly triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
  private readonly valkey = createValkeyConnection();

  constructor(@Inject(DRIZZLE) private readonly db: ReturnType<typeof getDb>) {}

  async handleIncoming(payload: WahaWebhookPayload): Promise<void> {
    if (payload.event !== "message") return;

    const msg = payload.payload as WahaMessagePayload;

    if (msg.fromMe) {
      return;
    }

    // ── Hanya proses pesan dari chat pribadi (DM) ─────────────────────────────
    const isPrivateChat =
      msg.from.endsWith("@c.us") || msg.from.endsWith("@lid");
    if (!isPrivateChat) {
      logger.debug(
        { from: msg.from },
        "Non-DM message ignored (group/broadcast/channel)",
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

    // ── Cek Perintah System (Bypass Guardrail) ──
    const p = this.triggerPrefix;
    const lowerBody = cleanBody.toLowerCase();

    // ── Cek Registrasi User ───────────────────────────────────────────────────
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    const isRegisterCommand = lowerBody.startsWith(p + "daftar");

    if (!user) {
      if (isRegisterCommand) {
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
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: `👋 Halo! Kamu belum terdaftar di FinCore.\n\nSilakan daftar terlebih dahulu dengan mengetik:\n*${this.triggerPrefix}daftar [Nama Kamu]*\n\nContoh: *${this.triggerPrefix}daftar Budi*`,
        });
      }
      return;
    }

    // ── Multi-turn: cek pending_action SEBELUM guardrail ─────────────────────────
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

    // ── Command Routing (Bypass AI) ───────────────────────────────────────────
    if (messageType === MessageType.TEXT && lowerBody.startsWith(p)) {
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

      // /hapus, /hapus terakhir, /hapus [nama], /konfirmasi, /ubah
      if (
        lowerBody.startsWith(p + "hapus") ||
        lowerBody.startsWith(p + "konfirmasi") ||
        lowerBody.startsWith(p + "ubah")
      ) {
        await enqueue(
          QueueName.TRANSACTION_COMMAND,
          JobName.PROCESS_TRANSACTION_COMMAND,
          { chatId: msg.from, senderPhone, commandText: cleanBody },
        );
        return;
      }

      // /tambah, /lihat, /cari
      if (
        lowerBody.startsWith(p + "tambah") ||
        lowerBody.startsWith(p + "lihat") ||
        lowerBody.startsWith(p + "cari")
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

      // /laporan harian
      if (
        lowerBody === p + "laporan hari" ||
        lowerBody === p + "laporan harian"
      ) {
        await enqueue(QueueName.REPORT_GENERATION, JobName.GENERATE_REPORT, {
          from: msg.from,
          senderPhone,
          query: "laporan hari ini",
          type: "query",
          rawMessageId: msg.id,
        });
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: "Sedang merekap laporan harian...",
          replyTo: msg.id,
        });
        return;
      }

      // /laporan mingguan
      if (
        lowerBody === p + "laporan minggu" ||
        lowerBody === p + "laporan mingguan"
      ) {
        await enqueue(QueueName.REPORT_GENERATION, JobName.GENERATE_REPORT, {
          from: msg.from,
          senderPhone,
          query: "laporan minggu ini",
          type: "query",
          rawMessageId: msg.id,
        });
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: "Sedang merekap laporan mingguan...",
          replyTo: msg.id,
        });
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
          { senderPhone },
        );
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: "Sedang merekap laporan bulanan...",
          replyTo: msg.id,
        });
        return;
      }

      // /summary - ringkasan hari ini / minggu ini
      if (lowerBody === p + "summary" || lowerBody === p + "ringkasan") {
        await enqueue(QueueName.REPORT_GENERATION, JobName.GENERATE_REPORT, {
          from: msg.from,
          senderPhone,
          query: "ringkasan bulan ini",
          type: "query",
          rawMessageId: msg.id,
        });
        await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
          chatId: msg.from,
          text: "Sedang merekap ringkasan...",
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
        text: `Fitur command ini sedang dibangun! 🚧\n\nKetik ${p}bantuan untuk melihat perintah yang tersedia.`,
        replyTo: msg.id,
      });
      return;
    }

    // ── Guardrail: check intent for text messages ─────────────────────────────
    if (messageType === MessageType.TEXT && cleanBody.length > 0) {
      const intentResult = await this.guardrail.detectIntent(cleanBody);

      if (!this.guardrail.isAllowed(intentResult.intent)) {
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

      // CONFIRMATION_REPLY - user menjawab ya/tidak untuk transaksi pending
      if (intentResult.intent === MessageIntent.CONFIRMATION_REPLY) {
        await enqueue(QueueName.CONFIRMATION, JobName.CONFIRM_TRANSACTION, {
          chatId: msg.from,
          senderPhone,
          answer: intentResult.extractedQuery ?? cleanBody, // "yes" or "no"
        });
        return;
      }

      // SETUP_RECURRING - user ingin set reminder tagihan berulang
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
      [MessageType.TEXT]: "Mencatat...",
      [MessageType.VOICE]: "Mendengarkan voice note...",
      [MessageType.IMAGE]: "Membaca gambar/struk...",
      [MessageType.DOCUMENT]: "Membaca dokumen...",
      [MessageType.VIDEO]: "Memproses video...",
    };
    return messages[type] ?? "Memproses...";
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
      `${salam}! Aku FinCore, asisten pencatat keuanganmu.\n\n` +
      `*Catat Transaksi*\n` +
      `Langsung ketik, kirim voice note, atau foto struk.\n` +
      `Contoh: _"Makan siang 25rb gopay"_\n\n` +
      `*Transaksi*\n` +
      `\`${p}hapus\` - hapus transaksi terakhir\n` +
      `\`${p}hapus [nama]\` - cari & hapus\n` +
      `\`${p}konfirmasi\` - konfirmasi pending\n\n` +
      `*Budget*\n` +
      `\`${p}budget set [kategori] [nominal]\`\n` +
      `\`${p}budget cek\`\n` +
      `\`${p}budget hapus [kategori]\`\n\n` +
      `*Laporan*\n` +
      `\`${p}summary\` - ringkasan singkat\n` +
      `\`${p}laporan bulanan\` - laporan lengkap bulan lalu\n` +
      `Atau tanya bebas: _"Berapa pengeluaranku minggu ini?"_\n\n` +
      `*Pengaturan*\n` +
      `\`${p}atur timezone Asia/Jakarta\`\n` +
      `\`${p}tambah metode [nama]\`\n` +
      `\`${p}tambah kategori [nama] expense\`\n` +
      `\`${p}lihat metode\` / \`${p}lihat kategori\``
    );
  }
}
