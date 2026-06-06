import { findUserByPhone } from "@/lib/user-lookup";
import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, recurringBills, trackEvent } from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { QueueName } from "@fincore/shared";
import { formatCurrency } from "@fincore/utils";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

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
Kamu adalah parser pengingat rutin (tagihan/pemasukan/kegiatan) untuk aplikasi FinCore.
Ekstrak informasi dari pesan user. Jika pesan sedikit ambigu (misal "setiap minggu di tanggal 29" yang sebenarnya bermaksud bulanan karena menyebut tanggal pasti), gunakan nalar logika untuk menentukan frekuensi yang paling masuk akal.

Frekuensi yang didukung (frequency):
- DAILY: setiap hari
- WEEKLY: setiap minggu (butuh day_of_week: 0=Minggu, 1=Senin, 2=Selasa, 3=Rabu, 4=Kamis, 5=Jumat, 6=Sabtu)
- MONTHLY: setiap bulan (butuh day_of_month: 1-31)
- YEARLY: setiap tahun (butuh day_of_month: 1-31, asumsikan bulan berjalan jika tidak ada)

Contoh:
- "Ingetin bayar listrik 250rb setiap tanggal 20" > frequency: "MONTHLY", day_of_month: 20
- "Ingetin sedekah 50k tiap jumat" > frequency: "WEEKLY", day_of_week: 5
- "ingetin setiap minggu di tanggal 29 800k gw ada gajian sama pak xxxxxxxx" > frequency: "MONTHLY", day_of_month: 29, amount: 800000, name: "Gajian pak xxxxxxxx"
- "Reminder minum obat tiap hari" > frequency: "DAILY"

Return HANYA JSON:
{
  "name": "nama kegiatan/tagihan singkat",
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

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(
        chatId,
        "Akun kamu belum terdaftar. Kirimkan pesan transaksi dulu ya.",
      );
      return;
    }

    const parsed = await this.parseRecurringBill(message);
    if (!parsed) {
      await sendWaMessage(
        chatId,
        'Maaf, aku tidak bisa memahami pengingat tagihan itu.\n\nContoh: "Ingetin bayar listrik 250rb setiap tanggal 20"',
      );
      return;
    }

    this.logger.info({ parsed }, "Recurring bill parsed");

    const nextReminderAt = this.computeNextReminderAt(parsed, "Asia/Jakarta");

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

    trackEvent({
      category: "user",
      event: "recurring.created",
      userId: user.id,
    }).catch(() => {});

    const amountStr =
      parsed.amount != null ? ` ${formatCurrency(parsed.amount, "IDR")}` : "";
    const nextStr = dayjs(nextReminderAt)
      .tz("Asia/Jakarta")
      .format("D MMMM YYYY");

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

    await sendWaMessage(
      chatId,
      `Pengingat tagihan disimpan!\n\nTagihan: ${parsed.name}${amountStr}\nJatuh tempo: ${freqStr}\nReminder H-1 pertama: ${nextStr}`,
    );
  }

  private computeNextReminderAt(parsed: ParsedRecurringBill, tz: string): Date {
    const now = dayjs().tz(tz);
    let candidate = now.startOf("day");
    const isPast = (date: dayjs.Dayjs) => date.isBefore(now, "day");

    if (parsed.frequency === "DAILY") {
      candidate = candidate.add(1, "day");
    } else if (parsed.frequency === "WEEKLY" && parsed.day_of_week != null) {
      const targetReminderDay = (parsed.day_of_week + 6) % 7;
      const diff = (targetReminderDay - candidate.day() + 7) % 7;
      candidate = candidate.add(diff, "day");
      if (diff === 0 && isPast(candidate)) candidate = candidate.add(1, "week");
    } else if (
      (parsed.frequency === "MONTHLY" || parsed.frequency === "YEARLY") &&
      parsed.day_of_month != null
    ) {
      const reminderDay = parsed.day_of_month - 1;
      const safeDay = reminderDay < 1 ? 1 : reminderDay;
      candidate = candidate.date(safeDay);
      if (isPast(candidate)) {
        if (parsed.frequency === "MONTHLY")
          candidate = candidate.add(1, "month").date(safeDay);
        else candidate = candidate.add(1, "year").date(safeDay);
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
          model: getConfig("AI_CLASSIFICATION_MODEL"),
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
}
