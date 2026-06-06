import { findUserByPhone } from "@/lib/user-lookup";
import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { eq } from "drizzle-orm";

const logger = createLogger("worker:settings-command");

export interface SettingsCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

const scheduleLabels: Record<string, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  off: "Tidak aktif",
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
      await this.handleRegister(chatId, senderPhone, name);
      return;
    }

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(
        chatId,
        `⚠️ Pengguna tidak ditemukan. Ketik *${p}daftar [Nama]* untuk mendaftar.`,
      );
      return;
    }

    // /atur laporan [daily|weekly|monthly|off]
    if (lower.startsWith(p + "atur laporan ")) {
      const schedule = lower.slice((p + "atur laporan ").length).trim();
      await this.handleSetReportSchedule(chatId, user.id, schedule);
      return;
    }

    // /atur nama [nama baru]
    if (lower.startsWith(p + "atur nama ")) {
      const newName = commandText.slice((p + "atur nama ").length).trim();
      await this.handleSetName(chatId, user.id, newName);
      return;
    }

    // /atur jam [HH:MM]
    if (lower.startsWith(p + "atur jam ")) {
      const time = lower.slice((p + "atur jam ").length).trim();
      await this.handleSetReportTime(chatId, user.id, time);
      return;
    }

    // /atur / /settings
    if (lower === p + "atur" || lower === p + "settings") {
      await this.handleShowSettings(chatId, user);
      return;
    }

    if (
      lower.startsWith(p + "atur timezone ") ||
      lower.startsWith(p + "atur matauang ")
    ) {
      await sendWaMessage(
        chatId,
        `ℹ️ FinCore sekarang menggunakan *Asia/Jakarta (WIB)* sebagai timezone default dan *IDR* sebagai mata uang default untuk semua pengguna.`,
      );
      return;
    }

    await sendWaMessage(
      chatId,
      `⚙️ Pengaturan yang tersedia:\n\n` +
        `• \`${p}atur nama [Nama Baru]\`\n` +
        `• \`${p}atur laporan daily|weekly|monthly|off\`\n` +
        `• \`${p}atur jam 07:00\`\n` +
        `• \`${p}atur\` - lihat pengaturan saat ini`,
    );
  }

  private async handleRegister(chatId: string, phone: string, name: string) {
    if (!name || name.length < 2) {
      await sendWaMessage(
        chatId,
        `⚠️ Nama terlalu pendek. Silakan gunakan format:\n*${this.prefix}daftar [Nama Kamu]*\n\nContoh: *${this.prefix}daftar Budi*`,
      );
      return;
    }

    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (existing) {
      await sendWaMessage(
        chatId,
        `⚠️ Kamu sudah terdaftar atas nama *${existing.name}*.`,
      );
      return;
    }

    await this.db.insert(users).values({
      phone,
      name,
      reportSchedule: "monthly",
      reportTime: "07:00",
      isActive: true,
      onboardedAt: null,
    });

    await sendWaMessage(
      chatId,
      `Pendaftaran berhasil, salam kenal *${name}*! 👋\n\nUntuk memulai, yuk catat saldo awal kamu saat ini.\nContoh ketik:\n_Saldo awal di bank jago 500rb_\natau\n_Isi dompetku sekarang ada 200rb_`,
    );
  }

  private async handleSetName(chatId: string, userId: string, name: string) {
    if (!name || name.length < 2) {
      await sendWaMessage(
        chatId,
        `⚠️ Nama terlalu pendek. Minimal 2 karakter.`,
      );
      return;
    }
    if (name.length > 100) {
      await sendWaMessage(
        chatId,
        `⚠️ Nama terlalu panjang. Maksimal 100 karakter.`,
      );
      return;
    }

    await this.db
      .update(users)
      .set({ name, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await sendWaMessage(chatId, `✅ Nama berhasil diubah menjadi *${name}*.`);
  }

  private async handleSetReportSchedule(
    chatId: string,
    userId: string,
    schedule: string,
  ) {
    const validSchedules = ["daily", "weekly", "monthly", "off"];
    if (!validSchedules.includes(schedule)) {
      await sendWaMessage(
        chatId,
        `⚠️ Jadwal tidak valid. Pilih salah satu: \`daily\`, \`weekly\`, \`monthly\`, atau \`off\`.`,
      );
      return;
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
    await sendWaMessage(chatId, msg);
  }

  private async handleSetReportTime(
    chatId: string,
    userId: string,
    time: string,
  ) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      await sendWaMessage(
        chatId,
        `⚠️ Format jam tidak valid. Gunakan format \`HH:MM\`, contoh: \`07:00\`, \`08:30\`.`,
      );
      return;
    }

    const [hh, mm] = time.split(":").map(Number);
    if (hh > 23 || mm > 59) {
      await sendWaMessage(
        chatId,
        `⚠️ Jam tidak valid. Jam harus 0–23 dan menit 0–59.`,
      );
      return;
    }

    await this.db
      .update(users)
      .set({ reportTime: time, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await sendWaMessage(chatId, `✅ Jam laporan otomatis diset ke *${time}*.`);
  }

  private async handleShowSettings(
    chatId: string,
    user: typeof users.$inferSelect,
  ) {
    const reply =
      `⚙️ *Pengaturan Akun*\n\n` +
      `👤 Nama: ${user.name ?? "—"}\n` +
      `🌏 Timezone: Asia/Jakarta (WIB)\n` +
      `💱 Mata uang: IDR\n` +
      `📅 Laporan: ${scheduleLabels[user.reportSchedule ?? "monthly"] ?? user.reportSchedule}\n` +
      `🕐 Jam laporan: \`${user.reportTime ?? "07:00"}\`\n\n` +
      `Ubah dengan perintah \`${this.prefix}atur [pengaturan] [nilai]\`.`;

    await sendWaMessage(chatId, reply);
  }
}
