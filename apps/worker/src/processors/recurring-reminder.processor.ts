import { BaseProcessor } from "@/processors/base.processor";
import { getDb, recurringBills, users } from "@fincore/db";
import { createValkeyConnection, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import {
  computeNextReminderDate,
  formatCurrency,
  formatDueDateLabel,
} from "@fincore/utils";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, lte } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

interface RecurringReminderJobData {
  // Data untuk manual trigger (opsional, biasanya kosong untuk cron)
  userId?: string;
}

@Injectable()
export class RecurringReminderProcessor
  extends BaseProcessor
  implements OnModuleInit
{
  readonly queueName = QueueName.RECURRING_REMINDER;

  constructor() {
    super("processor:recurring-reminder");
  }

  /**
   * Saat module init, daftarkan cron job ke BullMQ.
   * Setiap hari jam 07:00 WIB (UTC+7 = 00:00 UTC).
   */
  async onModuleInit(): Promise<void> {
    const { Queue } = await import("bullmq");

    const queue = new Queue(QueueName.RECURRING_REMINDER, {
      connection: createValkeyConnection(),
    });

    await queue.upsertJobScheduler(
      "daily-recurring-reminder",
      { pattern: "0 0 * * *" }, // 00:00 UTC = 07:00 WIB
      {
        name: JobName.SEND_RECURRING_REMINDER,
        data: {},
        opts: {
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 50 },
        },
      },
    );

    this.logger.info("Recurring reminder cron registered (daily 07:00 WIB)");
  }

  async process(job: Job<RecurringReminderJobData>): Promise<void> {
    const db = getDb();
    const now = new Date();

    // ── 1. Ambil semua tagihan yang nextReminderAt <= sekarang ─────────────────
    const dueBills = await db
      .select({
        bill: recurringBills,
        userPhone: users.phone,
        userTimezone: users.timezone,
      })
      .from(recurringBills)
      .innerJoin(users, eq(recurringBills.userId, users.id))
      .where(
        and(
          eq(recurringBills.isActive, true),
          lte(recurringBills.nextReminderAt, now),
        ),
      );

    this.logger.info(
      { count: dueBills.length },
      "Found recurring bills due for reminder",
    );

    for (const { bill, userPhone, userTimezone } of dueBills) {
      const tz = userTimezone ?? "Asia/Jakarta";
      const chatId = `${userPhone}@s.whatsapp.net`;

      // ── 2. Kirim reminder ────────────────────────────────────────────────────
      const amountStr =
        bill.amount != null
          ? ` ${formatCurrency(bill.amount, bill.currency)}`
          : "";

      const dueDateStr = formatDueDateLabel(bill.frequency, bill.dayOfMonth);

      const reminderText =
        `Pengingat tagihan!\n\n` +
        `Tagihan *${bill.name}*${amountStr} jatuh tempo ${dueDateStr}.\n\n` +
        `Jangan lupa bayar ya!`;

      await sendWaMessage(chatId, reminderText);

      this.logger.info(
        { billId: bill.id, name: bill.name, phone: userPhone },
        "Reminder sent",
      );

      // ── 3. Update nextReminderAt ke jadwal berikutnya ────────────────────────
      const nextReminderAt = computeNextReminderDate(
        bill.frequency,
        bill.dayOfMonth,
        tz,
      );

      await db
        .update(recurringBills)
        .set({
          lastReminderAt: now,
          nextReminderAt,
        })
        .where(eq(recurringBills.id, bill.id));
    }

    this.logger.info("Recurring reminder check complete");
  }
}
