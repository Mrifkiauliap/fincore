import { AuthService } from "@/modules/auth/auth.service";
import { CommandRouterService } from "@/modules/webhook/command-router.service";
import { DRIZZLE } from "@/modules/database/database.module";
import {
  mapWahaTypeToMessageType,
  WahaMessagePayload,
  WahaWebhookPayload,
} from "@/modules/webhook/waha-payload.dto";
import { FinanceGuardrail, MessageIntent } from "@fincore/ai";
import getConfig from "@fincore/config";
import { getDb } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, getSharedValkey, sendWaMessage } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { dayjsInTz, extractPhone } from "@fincore/utils";
import { Inject, Injectable } from "@nestjs/common";

const logger = createLogger("webhook");

@Injectable()
export class WebhookService {
  private readonly guardrail = new FinanceGuardrail();
  private readonly triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
  private readonly valkey = getSharedValkey();

  constructor(
    @Inject(DRIZZLE) private readonly db: ReturnType<typeof getDb>,
    private readonly authService: AuthService,
    private readonly commandRouter: CommandRouterService,
  ) {}

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

    // ── Multi-turn: cek pending_action SEBELUM pengecekan prefix ─────────────
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

    // ── Cek Prefix (Wajib untuk semua command/pesan baru) ─────────────────────
    const p = this.triggerPrefix.toLowerCase();
    const lowerBody = cleanBody.toLowerCase();

    const isMedia =
      messageType === MessageType.VOICE ||
      messageType === MessageType.IMAGE ||
      messageType === MessageType.DOCUMENT ||
      messageType === MessageType.VIDEO;
    let skipProcessing = false;

    if (p && !lowerBody.startsWith(p)) {
      if (isMedia) {
        skipProcessing = true; // Simpan saja di DB agar bisa di-reply, jangan diproses AI
      } else {
        logger.debug(
          { body: cleanBody, prefix: p },
          "Message ignored because it does not start with the required prefix",
        );
        return;
      }
    }

    if (!skipProcessing) {
      // ── Cek Registrasi User ───────────────────────────────────────────────────
      const user = await this.authService.checkUser(senderPhone);
      const isRegisterCommand = lowerBody.startsWith(p + "daftar");

      if (!user) {
        await this.authService.handleUnregisteredUser(
          senderPhone,
          msg.from,
          isRegisterCommand,
          cleanBody,
        );
        return;
      }

      // ── Command Routing (Bypass AI) ───────────────────────────────────────────
      if (messageType === MessageType.TEXT && lowerBody.startsWith(p)) {
        const result = await this.commandRouter.routeCommand(
          msg,
          senderPhone,
          cleanBody,
          lowerBody,
          this.getGreetingReply(null),
        );

        if (result.routed) {
          return;
        }
        // Falls through to AI guardrail for unrecognized commands (/catat, /beli, etc.)
      }

      // ── Guardrail: check intent for text messages ─────────────────────────────
      if (messageType === MessageType.TEXT && cleanBody.length > 0) {
        const intentResult = await this.guardrail.detectIntent(cleanBody);

        if (!this.guardrail.isAllowed(intentResult.intent)) {
          await sendWaMessage(
            msg.from,
            this.guardrail.getOutOfScopeReply(),
            msg.id,
          );
          logger.info(
            { intent: intentResult.intent },
            "Message rejected by guardrail",
          );
          return;
        }

        if (intentResult.intent === MessageIntent.GREETING) {
          await sendWaMessage(msg.from, this.getGreetingReply(null), msg.id);
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
          await sendWaMessage(msg.from, queryAck, msg.id);
          return;
        }

        // CONFIRMATION_REPLY - user menjawab ya/tidak untuk transaksi pending
        if (intentResult.intent === MessageIntent.CONFIRMATION_REPLY) {
          await enqueue(QueueName.CONFIRMATION, JobName.CONFIRM_TRANSACTION, {
            chatId: msg.from,
            senderPhone,
            answer: intentResult.extractedQuery ?? cleanBody,
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
          await sendWaMessage(
            msg.from,
            "Sedang menyimpan pengingat tagihan...",
            msg.id,
          );
          return;
        }
      }
    } // end of if (!skipProcessing)

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
        skipProcessing,
      },
    );

    logger.info(
      { waMessageId: msg.id, type: messageType, skipProcessing },
      "Job enqueued",
    );

    if (!skipProcessing) {
      const ackMessage = this.getAckMessage(messageType as MessageType);
      await sendWaMessage(msg.from, ackMessage, msg.id);
    }
  }

  // ─── Ack messages per type ────────────────────────────────────────────────
  private getAckMessage(type: MessageType): string {
    const messages: Record<MessageType, string> = {
      [MessageType.TEXT]: "Mencatat transaksi...",
      [MessageType.VOICE]: "Mendengarkan voice note...",
      [MessageType.IMAGE]: "Membaca gambar/struk...",
      [MessageType.DOCUMENT]: "Membaca dokumen...",
      [MessageType.VIDEO]: "Memproses video...",
    };
    return messages[type] ?? "Memproses...";
  }

  getGreetingReply(_userTimezone?: string | null): string {
    const hour = dayjsInTz().hour();
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
      `*Dashboard & Laporan*\n` +
      `\`${p}dashboard\` atau \`${p}login\` - Akses Web Dashboard\n` +
      `\`${p}summary\` - Ringkasan singkat\n` +
      `\`${p}laporan harian\` / \`${p}laporan bulanan\` - Laporan detail\n` +
      `Atau tanya AI: _"Berapa pengeluaranku minggu ini?"_\n\n` +
      `*Kelola Transaksi*\n` +
      `\`${p}ubah [nama]\` - Ubah data transaksi\n` +
      `\`${p}hapus\` - Hapus transaksi terakhir\n` +
      `\`${p}konfirmasi\` - Konfirmasi transaksi pending\n` +
      `\`${p}cari [kata kunci]\` - Cari transaksi\n\n` +
      `*Budget*\n` +
      `\`${p}budget set [kategori] [nominal]\`\n` +
      `\`${p}budget cek\` / \`${p}budget hapus [kat]\`\n\n` +
      `*Data Master & Pengaturan*\n` +
      `\`${p}tambah metode [nama]\`\n` +
      `\`${p}tambah kategori [nama] expense/income/transfer\`\n` +
      `\`${p}lihat metode\` / \`${p}lihat kategori\``
    );
  }
}
