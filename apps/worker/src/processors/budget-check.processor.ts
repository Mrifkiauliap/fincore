import { BaseProcessor } from "@/processors/base.processor";
import {
  budgets,
  getDb,
  transactionCategories,
  transactions,
  users,
} from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
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
    if (job.name !== JobName.CHECK_BUDGET) {
      return;
    }

    const { userId, categoryId, transactionId, amount } = job.data;

    // 1. Dapatkan user (untuk nomor HP dan timezone)
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return;

    // 2. Dapatkan batas periode berdasarkan timezone
    const tz = user.timezone ?? "Asia/Jakarta";
    const now = dayjs().tz(tz);
    const month = now.month() + 1; // 1-12
    const year = now.year();
    const periodStart = now.startOf("month").toDate();
    const periodEnd = now.endOf("month").toDate();

    // 3. Cari budget aktif untuk kategori ini di bulan ini
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
      // Tidak ada budget untuk kategori ini
      this.logger.debug(
        { userId, categoryId, month, year },
        "No active budget found for this category",
      );
      return;
    }

    const budgetLimit = Number(budget.amount);

    // 4. Hitung total pengeluaran kategori ini di bulan berjalan
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

    // 5. Cek notifikasi
    // Dapatkan nama kategori
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
      // Kirim ALERT
      const msg = `🚨 *BUDGET TERLAMPAUI!*\n\nPengeluaran kategori *${categoryName}* bulan ini sudah melampaui batas.\n\nBatas: ${formatter.format(budgetLimit)}\nTerpakai: ${formatter.format(totalSpent)} (${percentage.toFixed(0)}%)\n\nHarap berhemat! 🛑`;

      await sendWaMessage(user.phone, msg);

      await this.db
        .update(budgets)
        .set({ lastAlertSentAt: new Date() })
        .where(eq(budgets.id, budget.id));
    } else if (
      percentage >= 80 &&
      percentage < 100 &&
      !budget.lastWarningSentAt
    ) {
      // Kirim WARNING
      const sisa = budgetLimit - totalSpent;
      const msg = `⚠️ *Peringatan Budget!*\n\nPengeluaran kategori *${categoryName}* sudah mencapai ${percentage.toFixed(0)}% dari budget bulan ini.\n\nBatas: ${formatter.format(budgetLimit)}\nTerpakai: ${formatter.format(totalSpent)}\nSisa: ${formatter.format(sisa)}`;

      await sendWaMessage(user.phone, msg);

      await this.db
        .update(budgets)
        .set({ lastWarningSentAt: new Date() })
        .where(eq(budgets.id, budget.id));
    }
  }
}
