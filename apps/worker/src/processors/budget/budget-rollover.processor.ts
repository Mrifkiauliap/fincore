import { BaseProcessor } from "@/processors/base.processor";
import { budgets, getDb, users } from "@fincore/db";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class BudgetRolloverProcessor extends BaseProcessor {
  readonly queueName = QueueName.BUDGET_ROLLOVER;
  private readonly db = getDb();

  constructor() {
    super("worker:budget-rollover");
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JobName.ROLLOVER_BUDGETS) return;

    this.logger.info("Starting monthly budget rollover...");

    const allUsers = await this.db.select({ id: users.id }).from(users);

    let totalRolledOver = 0;
    let totalSkipped = 0;

    for (const user of allUsers) {
      const now = dayjs().tz("Asia/Jakarta");
      const currentMonth = now.month() + 1;
      const currentYear = now.year();

      const lastMonth = now.subtract(1, "month");
      const prevMonth = lastMonth.month() + 1;
      const prevYear = lastMonth.year();

      const prevBudgets = await this.db
        .select()
        .from(budgets)
        .where(
          and(
            eq(budgets.userId, user.id),
            eq(budgets.month, prevMonth),
            eq(budgets.year, prevYear),
            eq(budgets.isActive, true),
          ),
        );

      if (prevBudgets.length === 0) continue;

      for (const prev of prevBudgets) {
        const [existing] = await this.db
          .select({ id: budgets.id })
          .from(budgets)
          .where(
            and(
              eq(budgets.userId, user.id),
              eq(budgets.categoryId, prev.categoryId),
              eq(budgets.month, currentMonth),
              eq(budgets.year, currentYear),
            ),
          )
          .limit(1);

        if (existing) {
          totalSkipped++;
          continue;
        }

        await this.db.insert(budgets).values({
          userId: user.id,
          categoryId: prev.categoryId,
          amount: prev.amount,
          month: currentMonth,
          year: currentYear,
          notes: prev.notes ?? undefined,
          isActive: true,
          lastWarningSentAt: null,
          lastAlertSentAt: null,
        });

        totalRolledOver++;
      }
    }

    this.logger.info(
      { totalRolledOver, totalSkipped },
      "Budget rollover completed",
    );
  }
}
