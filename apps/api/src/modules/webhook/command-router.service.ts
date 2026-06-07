import { AuthService } from "@/modules/auth/auth.service";
import { WahaMessagePayload } from "@/modules/webhook/waha-payload.dto";
import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";

const logger = createLogger("webhook:command-router");

/**
 * Result returned by routeCommand().
 * - `routed: true` → command was handled; caller should return.
 * - `routed: false` → not a known command; caller should fall through to AI guardrail.
 */
export interface RouteResult {
  routed: boolean;
}

@Injectable()
export class CommandRouterService {
  private readonly prefix: string;

  constructor(private readonly authService: AuthService) {
    this.prefix = (getConfig("FINCORE_TRIGGER_PREFIX") ?? "").toLowerCase();
  }

  /**
   * Attempt to route a text message as a known command.
   * Returns `{ routed: true }` if handled, `{ routed: false }` otherwise.
   */
  async routeCommand(
    msg: WahaMessagePayload,
    senderPhone: string,
    cleanBody: string,
    lowerBody: string,
    greetingReply: string,
  ): Promise<RouteResult> {
    const p = this.prefix;
    if (!p || !lowerBody.startsWith(p)) {
      return { routed: false };
    }

    // ── /daftar ──────────────────────────────────────────────────────────
    const isRegisterCommand = lowerBody.startsWith(p + "daftar");
    if (isRegisterCommand) {
      const user = await this.authService.checkUser(senderPhone);
      if (!user) {
        // Unregistered — let webhook.service handle via handleUnregisteredUser
        return { routed: false };
      }
      await sendWaMessage(
        msg.from,
        `✅ Anda sudah terdaftar atas nama *${user.name}*.`,
        msg.id,
      );
      return { routed: true };
    }

    // ── /dashboard, /login ───────────────────────────────────────────────
    if (lowerBody === p + "dashboard" || lowerBody === p + "login") {
      const user = await this.authService.checkUser(senderPhone);
      if (!user) return { routed: false };

      const magicLink = await this.authService.generateMagicLink(user.id);
      await sendWaMessage(
        msg.from,
        `🔑 *Akses Dashboard FinCore*\n\nKlik tautan sekali pakai di bawah ini untuk masuk ke Dashboard Anda (berlaku 5 menit):\n\n${magicLink}`,
        msg.id,
      );
      return { routed: true };
    }

    // ── /budget ──────────────────────────────────────────────────────────
    if (lowerBody.startsWith(p + "budget")) {
      await enqueue(QueueName.BUDGET_COMMAND, JobName.PROCESS_BUDGET_COMMAND, {
        chatId: msg.from,
        senderPhone,
        commandText: cleanBody,
      });
      return { routed: true };
    }

    // ── /hapus, /konfirmasi, /ubah ───────────────────────────────────────
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
      return { routed: true };
    }

    // ── /tambah, /lihat, /cari, /me, /payment, /category ────────────────
    if (
      lowerBody.startsWith(p + "tambah") ||
      lowerBody.startsWith(p + "lihat") ||
      lowerBody.startsWith(p + "cari") ||
      lowerBody === p + "me" ||
      lowerBody.startsWith(p + "payment") ||
      lowerBody.startsWith(p + "category")
    ) {
      await enqueue(QueueName.CUSTOM_COMMAND, JobName.PROCESS_CUSTOM_COMMAND, {
        chatId: msg.from,
        senderPhone,
        commandText: cleanBody,
      });
      return { routed: true };
    }

    // ── /atur, /settings ────────────────────────────────────────────────
    if (
      lowerBody.startsWith(p + "atur") ||
      lowerBody.startsWith(p + "settings")
    ) {
      await enqueue(
        QueueName.SETTINGS_COMMAND,
        JobName.PROCESS_SETTINGS_COMMAND,
        { chatId: msg.from, senderPhone, commandText: cleanBody },
      );
      return { routed: true };
    }

    // ── /laporan harian ──────────────────────────────────────────────────
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
      await sendWaMessage(msg.from, "Sedang merekap laporan harian...", msg.id);
      return { routed: true };
    }

    // ── /laporan mingguan ────────────────────────────────────────────────
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
      await sendWaMessage(
        msg.from,
        "Sedang merekap laporan mingguan...",
        msg.id,
      );
      return { routed: true };
    }

    // ── /laporan bulanan ─────────────────────────────────────────────────
    if (
      lowerBody === p + "laporan bulan" ||
      lowerBody === p + "laporan bulanan"
    ) {
      await enqueue(QueueName.MONTHLY_REPORT, JobName.GENERATE_MONTHLY_REPORT, {
        senderPhone,
      });
      await sendWaMessage(
        msg.from,
        "Sedang merekap laporan bulanan...",
        msg.id,
      );
      return { routed: true };
    }

    // ── /summary, /ringkasan ─────────────────────────────────────────────
    if (lowerBody === p + "summary" || lowerBody === p + "ringkasan") {
      await enqueue(QueueName.REPORT_GENERATION, JobName.GENERATE_REPORT, {
        from: msg.from,
        senderPhone,
        query: "ringkasan bulan ini",
        type: "query",
        rawMessageId: msg.id,
      });
      await sendWaMessage(msg.from, "Sedang merekap ringkasan...", msg.id);
      return { routed: true };
    }

    // ── /bantuan, /help ──────────────────────────────────────────────────
    if (
      lowerBody.startsWith(p + "bantuan") ||
      lowerBody.startsWith(p + "help")
    ) {
      await sendWaMessage(msg.from, greetingReply, msg.id);
      return { routed: true };
    }

    // ── /ulangi, /retry, /proses ulang ───────────────────────────────────
    if (
      lowerBody === p + "ulangi" ||
      lowerBody === p + "retry" ||
      lowerBody === p + "proses ulang"
    ) {
      await sendWaMessage(
        msg.from,
        "🔄 Untuk memproses ulang pesan yang gagal, *balas* (reply) pesan tersebut dengan kata *ulangi*.\n\nJangan kirim sebagai pesan baru ya! 🙏",
        msg.id,
      );
      return { routed: true };
    }

    // ── /catat — fall through to AI ──────────────────────────────────────
    if (lowerBody.startsWith(p + "catat")) {
      logger.debug("Received /catat command, passing to AI Guardrail");
      return { routed: false };
    }

    // Unknown command — fall through to AI guardrail
    return { routed: false };
  }
}
