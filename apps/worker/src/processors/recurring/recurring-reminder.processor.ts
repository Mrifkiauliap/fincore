import { BaseProcessor } from "@/processors/base.processor";
import { getDb, recurringBills, trackEvent, users } from "@fincore/db";
import { getSharedValkey, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import {
  computeNextReminderDate,
  formatCurrency,
  formatDueDateLabel,
} from "@fincore/utils";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { and, eq, lte } from "drizzle-orm";

interface RecurringReminderJobData {
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

  async onModuleInit(): Promise<void> {
    const { Queue } = await import("bullmq");

    const queue = new Queue(QueueName.RECURRING_REMINDER, {
      connection: getSharedValkey(),
    });

    await queue.upsertJobScheduler(
      "daily-recurring-reminder",
      { pattern: "0 0 * * *" },
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

    const dueBills = await db
      .select({ bill: recurringBills, userPhone: users.phone })
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

    for (const { bill, userPhone } of dueBills) {
      const chatId = `${userPhone}@s.whatsapp.net`;

      const amountStr =
        bill.amount != null ? ` ${formatCurrency(bill.amount, "IDR")}` : "";
      const dueDateStr = formatDueDateLabel(bill.frequency, bill.dayOfMonth);

      const reminderText =
        `Pengingat tagihan!\n\n` +
        `Tagihan *${bill.name}*${amountStr} jatuh tempo ${dueDateStr}.\n\n` +
        `Jangan lupa bayar ya!`;

      await sendWaMessage(chatId, reminderText);

      trackEvent({
        category: "system",
        event: "recurring.reminder.sent",
        userId: bill.userId,
      }).catch(() => {});

      this.logger.info(
        { billId: bill.id, name: bill.name, phone: userPhone },
        "Reminder sent",
      );

      const nextReminderAt = computeNextReminderDate(
        bill.frequency,
        bill.dayOfMonth,
        "Asia/Jakarta",
      );

      await db
        .update(recurringBills)
        .set({ lastReminderAt: now, nextReminderAt })
        .where(eq(recurringBills.id, bill.id));
    }

    this.logger.info("Recurring reminder check complete");
  }
}
