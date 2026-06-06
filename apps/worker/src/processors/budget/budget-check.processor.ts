import { BaseProcessor } from "@/processors/base.processor";
import {
  budgets,
  getDb,
  trackEvent,
  transactionCategories,
  transactions,
  users,
} from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { formatCurrency } from "@fincore/utils";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, lte } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface BudgetCheckJobData {
  userId: string;
  categoryId: string;
  transactionId: string;
  amount: number;
}

@Injectable()
export class BudgetCheckProcessor extends BaseProcessor {
  readonly queueName = QueueName.BUDGET_CHECK;
  private readonly db = getDb();

  constructor() {
    super("worker:budget-check");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 5 };
  }

  async process(job: Job<BudgetCheckJobData>): Promise<void> {
    if (job.name !== JobName.CHECK_BUDGET) return;

    const { userId, categoryId, transactionId, amount } = job.data;

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return;

    const now = dayjs().tz("Asia/Jakarta");
    const month = now.month() + 1;
    const year = now.year();
    const periodStart = now.startOf("month").toDate();
    const periodEnd = now.endOf("month").toDate();

    const [budget] = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.categoryId, categoryId),
          eq(budgets.month, month),
          eq(budgets.year, year),
          eq(budgets.isActive, true),
        ),
      )
      .limit(1);

    if (!budget) {
      this.logger.debug(
        { userId, categoryId, month, year },
        "No active budget found for this category",
      );
      return;
    }

    const budgetLimit = Number(budget.amount);

    const userTransactions = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.categoryId, categoryId),
          eq(transactions.type, "expense"),
          eq(transactions.isDeleted, false),
          gte(transactions.transactionDate, periodStart),
          lte(transactions.transactionDate, periodEnd),
        ),
      );

    const totalSpent = userTransactions.reduce(
      (acc, tx) => acc + Number(tx.totalAmount),
      0,
    );
    const percentage = (totalSpent / budgetLimit) * 100;

    this.logger.info(
      { userId, categoryId, percentage, totalSpent, budgetLimit },
      "Budget check result",
    );

    const [cat] = await this.db
      .select()
      .from(transactionCategories)
      .where(eq(transactionCategories.id, categoryId))
      .limit(1);
    const categoryName = cat?.name ?? "Tidak Diketahui";

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });

    if (percentage >= 100 && !budget.lastAlertSentAt) {
      const msg = `🚨 *BUDGET TERLAMPAUI!*\n\nPengeluaran kategori *${categoryName}* bulan ini sudah melampaui batas.\n\nBatas: ${formatter.format(budgetLimit)}\nTerpakai: ${formatter.format(totalSpent)} (${percentage.toFixed(0)}%)\n\nHarap berhemat! 🛑`;

      await sendWaMessage(user.phone, msg);

      trackEvent({
        category: "transaction",
        event: "budget.alert.sent",
        userId,
      }).catch(() => {});

      await this.db
        .update(budgets)
        .set({ lastAlertSentAt: new Date() })
        .where(eq(budgets.id, budget.id));
    } else if (
      percentage >= 80 &&
      percentage < 100 &&
      !budget.lastWarningSentAt
    ) {
      const sisa = budgetLimit - totalSpent;
      const msg = `⚠️ *Peringatan Budget!*\n\nPengeluaran kategori *${categoryName}* sudah mencapai ${percentage.toFixed(0)}% dari budget bulan ini.\n\nBatas: ${formatCurrency(budgetLimit, "IDR")}\nTerpakai: ${formatCurrency(totalSpent, "IDR")}\nSisa: ${formatCurrency(sisa, "IDR")}`;

      await sendWaMessage(user.phone, msg);

      trackEvent({
        category: "transaction",
        event: "budget.warning.sent",
        userId,
      }).catch(() => {});

      await this.db
        .update(budgets)
        .set({ lastWarningSentAt: new Date() })
        .where(eq(budgets.id, budget.id));
    }
  }
}
