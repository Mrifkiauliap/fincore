import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, recurringBills, users } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { eq } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

interface RecurringSetupJobData {
  chatId: string;
  senderPhone: string;
  message: string;
}

interface ParsedRecurringBill {
  name: string;
  amount: number | null;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  day_of_month: number | null;
  day_of_week: number | null;
  notes: string | null;
}

const RECURRING_PARSER_PROMPT = `
Kamu adalah parser pengingat tagihan berulang untuk aplikasi FinCore.
Ekstrak informasi tagihan dari pesan user.

Frekuensi yang didukung (frequency):
- DAILY: setiap hari
- WEEKLY: setiap minggu (butuh day_of_week: 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu)
- MONTHLY: setiap bulan (butuh day_of_month: 1-31)
- YEARLY: setiap tahun (butuh day_of_month: 1-31, asumsikan bulan berjalan jika tidak ada)

Contoh:
- "Ingetin bayar listrik 250rb setiap tanggal 20" → frequency: "MONTHLY", day_of_month: 20
- "Ingetin sedekah 50k tiap jumat" → frequency: "WEEKLY", day_of_week: 5
- "Reminder minum obat tiap hari" → frequency: "DAILY"
- "Ingetin bayar kos tiap tgl 5" → frequency: "MONTHLY", day_of_month: 5

Return HANYA JSON:
{
  "name": "nama tagihan singkat",
  "amount": number atau null,
  "frequency": "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
  "day_of_month": number (1-31) atau null,
  "day_of_week": number (0-6) atau null,
  "notes": "catatan tambahan atau null"
}
`.trim();

@Injectable()
export class RecurringSetupProcessor extends BaseProcessor {
  readonly queueName = QueueName.RECURRING_SETUP;

  constructor() {
    super("processor:recurring-setup");
  }

  async process(job: Job<RecurringSetupJobData>): Promise<void> {
    const { chatId, senderPhone, message } = job.data;
    const db = getDb();

    // ── 1. Get user ────────────────────────────────────────────────────────────
    const [user] = await db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    if (!user) {
      await this.sendReply(
        chatId,
        "Akun kamu belum terdaftar. Kirimkan pesan transaksi dulu ya.",
      );
      return;
    }

    // ── 2. Parse via AI ────────────────────────────────────────────────────────
    const parsed = await this.parseRecurringBill(message);
    if (!parsed) {
      await this.sendReply(
        chatId,
        "Maaf, aku tidak bisa memahami pengingat tagihan itu.\n\n" +
          'Contoh: _"Ingetin bayar listrik 250rb setiap tanggal 20"_',
      );
      return;
    }

    this.logger.info({ parsed }, "Recurring bill parsed");

    // ── 3. Hitung nextReminderAt (H-1 dari due date) ────────────────────────
    const tz = user.timezone ?? "Asia/Jakarta";
    const nextReminderAt = this.computeNextReminderAt(parsed, tz);

    // ── 4. Insert ke DB ────────────────────────────────────────────────────────
    const [bill] = await db
      .insert(recurringBills)
      .values({
        userId: user.id,
        name: parsed.name,
        amount: parsed.amount != null ? String(parsed.amount) : null,
        frequency: parsed.frequency,
        dayOfMonth: parsed.day_of_month ?? undefined,
        dayOfWeek: parsed.day_of_week ?? undefined,
        nextReminderAt,
        notes: parsed.notes ?? undefined,
      })
      .returning();

    this.logger.info({ billId: bill.id }, "Recurring bill created");

    // ── 5. Reply konfirmasi ────────────────────────────────────────────────────
    const amountStr =
      parsed.amount != null
        ? ` Rp ${new Intl.NumberFormat("id-ID").format(parsed.amount)}`
        : "";

    const nextStr = dayjs(nextReminderAt).tz(tz).format("D MMMM YYYY");
    let freqStr = "";
    if (parsed.frequency === "DAILY") freqStr = "setiap hari";
    else if (parsed.frequency === "WEEKLY") {
      const days = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      freqStr = `setiap hari ${days[parsed.day_of_week ?? 0]}`;
    } else if (parsed.frequency === "MONTHLY") {
      freqStr = `setiap tanggal ${parsed.day_of_month}`;
    } else if (parsed.frequency === "YEARLY") {
      freqStr = `setiap tahun tanggal ${parsed.day_of_month}`;
    }

    await this.sendReply(
      chatId,
      `Pengingat tagihan disimpan!\n\n` +
        `Tagihan: ${parsed.name}${amountStr}\n` +
        `Jatuh tempo: ${freqStr}\n` +
        `Reminder H-1 pertama: ${nextStr}`,
    );
  }

  /**
   * Hitung tanggal nextReminderAt (H-1 dari due date).
   */
  private computeNextReminderAt(parsed: ParsedRecurringBill, tz: string): Date {
    const now = dayjs().tz(tz);
    let candidate = now.startOf("day"); // Mulai dari hari ini
    const isPast = (date: dayjs.Dayjs) => date.isBefore(now, "day");

    if (parsed.frequency === "DAILY") {
      // H-1 untuk DAILY pada dasarnya adalah "hari ini",
      // Tapi untuk menghindari langsung trigger jika sudah lewat jam cron, kita set untuk "hari ini"
      candidate = candidate.add(1, "day");
    } else if (parsed.frequency === "WEEKLY" && parsed.day_of_week != null) {
      // Cari hari dalam seminggu (misal day_of_week = 5 (Jumat))
      // Reminder H-1 berarti hari Kamis (day_of_week = 4)
      const targetReminderDay = (parsed.day_of_week + 6) % 7;

      // Hitung perbedaan hari ke reminder
      const diff = (targetReminderDay - candidate.day() + 7) % 7;
      candidate = candidate.add(diff, "day");

      // Jika candidate sudah lewat hari ini, tambahkan 1 minggu
      if (diff === 0 && isPast(candidate)) {
        candidate = candidate.add(1, "week");
      }
    } else if (
      (parsed.frequency === "MONTHLY" || parsed.frequency === "YEARLY") &&
      parsed.day_of_month != null
    ) {
      const reminderDay = parsed.day_of_month - 1; // H-1
      const safeDay = reminderDay < 1 ? 1 : reminderDay; // Simplified fallback for 1st day of month -> remind on 1st

      candidate = candidate.date(safeDay);

      if (isPast(candidate)) {
        if (parsed.frequency === "MONTHLY") {
          candidate = candidate.add(1, "month").date(safeDay);
        } else {
          candidate = candidate.add(1, "year").date(safeDay);
        }
      }
    }

    return candidate.toDate();
  }

  private async parseRecurringBill(
    message: string,
  ): Promise<ParsedRecurringBill | null> {
    try {
      const res = await axios.post(
        `${getConfig("SUMOPOD_BASE_URL")}/chat/completions`,
        {
          model: "gemini/gemini-2.0-flash-lite",
          messages: [
            { role: "system", content: RECURRING_PARSER_PROMPT },
            { role: "user", content: message },
          ],
          temperature: 0,
          max_tokens: 168,
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${getConfig("SUMOPOD_API_KEY")}`,
            "Content-Type": "application/json",
          },
          timeout: 8_000,
        },
      );

      const raw = JSON.parse(res.data.choices[0].message.content);
      if (!raw.name || !raw.frequency) return null;
      return raw as ParsedRecurringBill;
    } catch (err) {
      this.logger.warn({ err }, "Failed to parse recurring bill");
      return null;
    }
  }

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
