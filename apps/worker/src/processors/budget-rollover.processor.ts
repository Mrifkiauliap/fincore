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

    // 1. Ambil semua user yang punya budget aktif di bulan lalu
    const allUsers = await this.db
      .select({ id: users.id, timezone: users.timezone })
      .from(users);

    let totalRolledOver = 0;
    let totalSkipped = 0;

    for (const user of allUsers) {
      const tz = user.timezone ?? "Asia/Jakarta";
      const now = dayjs().tz(tz);

      const currentMonth = now.month() + 1; // 1-12
      const currentYear = now.year();

      // Hitung bulan lalu
      const lastMonth = now.subtract(1, "month");
      const prevMonth = lastMonth.month() + 1;
      const prevYear = lastMonth.year();

      // 2. Ambil semua budget aktif dari bulan lalu
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
        // 3. Cek apakah sudah ada budget untuk bulan ini (kategori yang sama)
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

        // 4. Insert rollover - salin amount, currency, notes dari bulan lalu
        await this.db.insert(budgets).values({
          userId: user.id,
          categoryId: prev.categoryId,
          amount: prev.amount,
          currency: prev.currency,
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
