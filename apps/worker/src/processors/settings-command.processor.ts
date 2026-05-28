import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, users } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { eq } from "drizzle-orm";

export interface SettingsCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

// Timezone list Indonesia yang umum digunakan
const VALID_TZ_ALIASES: Record<string, string> = {
  wib: "Asia/Jakarta",
  wit: "Asia/Jayapura",
  wita: "Asia/Makassar",
  jakarta: "Asia/Jakarta",
  makassar: "Asia/Makassar",
  jayapura: "Asia/Jayapura",
  bali: "Asia/Makassar",
  medan: "Asia/Jakarta",
  surabaya: "Asia/Jakarta",
};

@Injectable()
export class SettingsCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.SETTINGS_COMMAND;
  private readonly db = getDb();
  private readonly prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  constructor() {
    super("worker:settings-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<SettingsCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_SETTINGS_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;
    const p = this.prefix;

    const lower = commandText.toLowerCase().trim();

    // /daftar [nama]
    if (lower.startsWith(p + "daftar ")) {
      const name = commandText.slice((p + "daftar ").length).trim();
      return this.handleRegister(chatId, senderPhone, name);
    }

    // 1. Ambil user (kecuali untuk /daftar yang mungkin belum ada usernya)
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    if (!user) {
      return this.sendReply(
        chatId,
        `⚠️ Pengguna tidak ditemukan. Ketik *${p}daftar [Nama]* untuk mendaftar.`,
      );
    }

    // /atur timezone [tz]
    if (lower.startsWith(p + "atur timezone ")) {
      const tzInput = commandText.slice((p + "atur timezone ").length).trim();
      return this.handleSetTimezone(chatId, user.id, tzInput);
    }

    // /atur laporan [daily|weekly|monthly|off]
    if (lower.startsWith(p + "atur laporan ")) {
      const schedule = lower.slice((p + "atur laporan ").length).trim();
      return this.handleSetReportSchedule(chatId, user.id, schedule);
    }

    // /atur jam [HH:MM]
    if (lower.startsWith(p + "atur jam ")) {
      const time = lower.slice((p + "atur jam ").length).trim();
      return this.handleSetReportTime(chatId, user.id, time);
    }

    // /atur (tanpa argumen) — tampilkan settings saat ini
    if (lower === p + "atur" || lower === p + "settings") {
      return this.handleShowSettings(chatId, user);
    }

    await this.sendReply(
      chatId,
      `⚙️ Pengaturan yang tersedia:\n\n` +
        `• \`${p}atur timezone Asia/Jakarta\`\n` +
        `• \`${p}atur laporan daily|weekly|monthly|off\`\n` +
        `• \`${p}atur jam 07:00\`\n` +
        `• \`${p}atur\` — lihat pengaturan saat ini`,
    );
  }

  // ─── HANDLERS ─────────────────────────────────────────────────────────────

  private async handleRegister(chatId: string, phone: string, name: string) {
    if (!name || name.length < 2) {
      return this.sendReply(
        chatId,
        `⚠️ Nama terlalu pendek. Silakan gunakan format:\n*${this.prefix}daftar [Nama Kamu]*\n\nContoh: *${this.prefix}daftar Budi*`,
      );
    }

    // Cek apakah sudah terdaftar
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (existing) {
      return this.sendReply(
        chatId,
        `⚠️ Kamu sudah terdaftar atas nama *${existing.name}*.`,
      );
    }

    await this.db.insert(users).values({
      phone,
      name,
      timezone: "Asia/Jakarta", // default
      reportSchedule: "monthly", // default
      reportTime: "07:00", // default
      preferredCurrency: "IDR", // default
      isActive: true,
      onboardedAt: null, // Biarkan null agar memicu surprise onboarding di message.processor
    });

    await this.sendReply(
      chatId,
      `✅ Pendaftaran berhasil, *${name}*! Kamu sudah bisa mulai berinteraksi dengan FinCore. Coba kirimkan pencatatan keuangan pertamamu!`,
    );
  }

  private async handleSetTimezone(
    chatId: string,
    userId: string,
    tzInput: string,
  ) {
    // Cek alias
    const resolved = VALID_TZ_ALIASES[tzInput.toLowerCase()] ?? tzInput;

    // Validasi sederhana — format Asia/X atau UTC dll
    const isValid =
      /^[A-Za-z]+\/[A-Za-z_]+$/.test(resolved) || resolved === "UTC";

    if (!isValid) {
      return this.sendReply(
        chatId,
        `⚠️ Timezone tidak valid: *${tzInput}*\n\n` +
          `Gunakan format IANA seperti:\n` +
          `• \`Asia/Jakarta\` (WIB)\n` +
          `• \`Asia/Makassar\` (WITA)\n` +
          `• \`Asia/Jayapura\` (WIT)\n\n` +
          `Atau shortcut: \`wib\`, \`wita\`, \`wit\``,
      );
    }

    await this.db
      .update(users)
      .set({ timezone: resolved, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await this.sendReply(
      chatId,
      `✅ Timezone berhasil diubah ke *${resolved}*.\nSemua kalkulasi waktu sekarang menggunakan timezone ini.`,
    );
  }

  private async handleSetReportSchedule(
    chatId: string,
    userId: string,
    schedule: string,
  ) {
    const validSchedules = ["daily", "weekly", "monthly", "off"];
    const scheduleLabels: Record<string, string> = {
      daily: "Harian",
      weekly: "Mingguan",
      monthly: "Bulanan",
      off: "Tidak aktif",
    };

    if (!validSchedules.includes(schedule)) {
      return this.sendReply(
        chatId,
        `⚠️ Jadwal tidak valid. Pilih salah satu: \`daily\`, \`weekly\`, \`monthly\`, atau \`off\`.`,
      );
    }

    await this.db
      .update(users)
      .set({ reportSchedule: schedule, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const label = scheduleLabels[schedule];
    const msg =
      schedule === "off"
        ? `✅ Laporan otomatis dinonaktifkan.`
        : `✅ Laporan otomatis diset ke *${label}*.\nKamu akan menerima laporan secara ${label.toLowerCase()}.`;

    await this.sendReply(chatId, msg);
  }

  private async handleSetReportTime(
    chatId: string,
    userId: string,
    time: string,
  ) {
    // Validasi format HH:MM
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return this.sendReply(
        chatId,
        `⚠️ Format jam tidak valid. Gunakan format \`HH:MM\`, contoh: \`07:00\`, \`08:30\`.`,
      );
    }

    const [hh, mm] = time.split(":").map(Number);
    if (hh > 23 || mm > 59) {
      return this.sendReply(
        chatId,
        `⚠️ Jam tidak valid. Jam harus 0–23 dan menit 0–59.`,
      );
    }

    await this.db
      .update(users)
      .set({ reportTime: time, updatedAt: new Date() })
      .where(eq(users.id, userId));

    await this.sendReply(chatId, `✅ Jam laporan otomatis diset ke *${time}*.`);
  }

  private async handleShowSettings(
    chatId: string,
    user: typeof users.$inferSelect,
  ) {
    const scheduleLabels: Record<string, string> = {
      daily: "Harian",
      weekly: "Mingguan",
      monthly: "Bulanan",
      off: "Tidak aktif",
    };

    const reply =
      `⚙️ *Pengaturan Akun*\n\n` +
      `🌏 Timezone: \`${user.timezone ?? "Asia/Jakarta"}\`\n` +
      `📅 Laporan: ${scheduleLabels[user.reportSchedule ?? "monthly"] ?? user.reportSchedule}\n` +
      `🕐 Jam laporan: \`${user.reportTime ?? "07:00"}\`\n` +
      `💱 Mata uang: ${user.preferredCurrency ?? "IDR"}\n\n` +
      `Ubah dengan perintah \`${this.prefix}atur [pengaturan] [nilai]\`.`;

    await this.sendReply(chatId, reply);
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
