import { BaseProcessor } from "@/processors/base.processor";
import { SumopodProvider } from "@fincore/ai";
import {
  budgets,
  getDb,
  reports,
  transactions,
  users,
  type ReportData,
} from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import dayjs from "dayjs";
import "dayjs/locale/id";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

interface MonthlyReportJobData {
  senderPhone?: string;
}

@Injectable()
export class MonthlyReportProcessor extends BaseProcessor {
  readonly queueName = QueueName.MONTHLY_REPORT;

  private readonly db = getDb();
  private readonly ai = new SumopodProvider();

  constructor() {
    super("worker:monthly-report");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 1 };
  }

  async process(job: Job<MonthlyReportJobData>): Promise<void> {
    if (job.name !== JobName.GENERATE_MONTHLY_REPORT) {
      return;
    }

    const { senderPhone } = job.data ?? {};

    // Tentukan periode (bulan lalu) akan dihitung per-user berdasarkan timezone-nya
    const now = new Date();

    // 1. Ambil user aktif
    let activeUsers = [];
    if (senderPhone) {
      this.logger.info({ senderPhone }, "Manual trigger for single user");
      activeUsers = await this.db
        .select()
        .from(users)
        .where(eq(users.phone, senderPhone));
    } else {
      this.logger.info(
        "Starting monthly report generation for all active users...",
      );
      activeUsers = await this.db.select().from(users);
    }
    this.logger.info({ userCount: activeUsers.length }, "Found active users");

    for (const user of activeUsers) {
      try {
        await this.generateForUser(user, now);
      } catch (err) {
        this.logger.error(
          { userId: user.id, err },
          "Failed to generate monthly report for user",
        );
      }
    }

    this.logger.info("Finished monthly report generation");
  }

  private async generateForUser(
    user: { id: string; phone: string; timezone: string | null },
    nowUtc: Date,
  ) {
    const tz = user.timezone ?? "Asia/Jakarta";
    const nowTz = dayjs(nowUtc).tz(tz);

    // Karena cron berjalan jam 7 pagi tgl 1 (WIB),
    // kita kurangi 1 bulan lalu ambil awal dan akhir bulannya di timezone user
    const targetMonth = nowTz.subtract(1, "month");
    const periodStart = targetMonth.startOf("month").toDate();
    const periodEnd = targetMonth.endOf("month").toDate();

    // 2. Cek Idempotensi (Apakah laporan bulan ini sudah digenerate?)
    const existingReport = await this.db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.userId, user.id),
          eq(reports.type, "monthly"),
          eq(reports.periodStart, periodStart),
        ),
      )
      .limit(1);

    if (existingReport.length > 0) {
      this.logger.info(
        { userId: user.id },
        "Report for this period already exists, skipping...",
      );
      return;
    }

    // 3. Cari Carry-Forward (Saldo bulan sebelumnya)
    const lastReport = await this.db
      .select()
      .from(reports)
      .where(
        and(
          eq(reports.userId, user.id),
          eq(reports.type, "monthly"),
          lt(reports.periodStart, periodStart),
        ),
      )
      .orderBy(desc(reports.periodEnd))
      .limit(1);

    const openingBalance =
      lastReport.length > 0 ? Number(lastReport[0].closingBalance) : 0;

    // 4. Hitung Agregasi Transaksi Bulan Ini
    const userTransactions = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.isDeleted, false),
          gte(transactions.transactionDate, periodStart),
          lte(transactions.transactionDate, periodEnd),
        ),
      );

    if (userTransactions.length === 0 && openingBalance === 0) {
      this.logger.info(
        { userId: user.id },
        "No transactions and no opening balance. Skipping report.",
      );
      // Optional: Kirim notifikasi tidak ada transaksi
      return;
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let totalTransfer = 0;
    const categoryMap: Record<string, number> = {};

    for (const tx of userTransactions) {
      const amount = Number(tx.totalAmount);
      if (tx.type === "income") {
        totalIncome += amount;
      } else if (tx.type === "expense") {
        totalExpense += amount;
        const catName = tx.categoryId || "Lainnya";
        categoryMap[catName] = (categoryMap[catName] || 0) + amount;
      } else if (tx.type === "transfer") {
        totalTransfer += amount;
      }
    }

    const closingBalance = openingBalance + totalIncome - totalExpense;

    // Sort Top 5 Expenses
    const topCategories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({
        categoryName: name,
        total,
        percentage: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
      }));

    const reportData: ReportData = {
      totalIncome,
      totalExpense,
      totalTransfer,
      netBalance: totalIncome - totalExpense,
      currency: "IDR",
      breakdown: [],
      topCategories,
      transactionCount: userTransactions.length,
    };

    // 5. Generate AI Insight
    let insight = "";
    if (userTransactions.length > 0) {
      insight = await this.ai.generateSummary({
        openingBalance,
        totalIncome,
        totalExpense,
        topExpenses: topCategories,
        closingBalance,
      });
    }

    // 4.5 Cek status budget
    const activeBudgets = await this.db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, user.id),
          eq(budgets.month, targetMonth.month() + 1),
          eq(budgets.year, targetMonth.year()),
          eq(budgets.isActive, true),
        ),
      );

    let budgetSummaryStr = "";
    if (activeBudgets.length > 0) {
      let overBudgetCount = 0;
      let safeBudgetCount = 0;

      const spentByCatId = new Map<string, number>();
      for (const tx of userTransactions) {
        if (tx.type === "expense" && tx.categoryId) {
          spentByCatId.set(
            tx.categoryId,
            (spentByCatId.get(tx.categoryId) || 0) + Number(tx.totalAmount),
          );
        }
      }

      for (const b of activeBudgets) {
        const spent = spentByCatId.get(b.categoryId) || 0;
        const limit = Number(b.amount);
        if (spent >= limit) {
          overBudgetCount++;
        } else {
          safeBudgetCount++;
        }
      }

      budgetSummaryStr = `📋 *Ringkasan Budget:*\n`;
      if (safeBudgetCount > 0)
        budgetSummaryStr += `• ${safeBudgetCount} kategori dalam batas ✅\n`;
      if (overBudgetCount > 0)
        budgetSummaryStr += `• ${overBudgetCount} kategori terlampaui 🚨\n`;
      budgetSummaryStr += `\n`;
    }

    // 6. Simpan Laporan ke DB
    const [inserted] = await this.db
      .insert(reports)
      .values({
        userId: user.id,
        type: "monthly",
        periodStart,
        periodEnd,
        openingBalance: openingBalance.toString(),
        closingBalance: closingBalance.toString(),
        summary: insight,
        data: reportData,
        sentAt: null, // belum dikirim
      })
      .returning();

    // 7. Format WhatsApp Message
    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });

    const monthName = periodStart.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });

    let messageStr = `📊 *Laporan Keuangan Bulanan — ${monthName}*\n\n`;
    messageStr += `💰 Saldo Awal: ${formatter.format(openingBalance)}\n`;
    messageStr += `➕ Total Pemasukan: ${formatter.format(totalIncome)}\n`;
    messageStr += `➖ Total Pengeluaran: ${formatter.format(totalExpense)}\n`;
    messageStr += `💳 Total Transfer: ${formatter.format(totalTransfer)}\n`;
    messageStr += `✅ Saldo Akhir: ${formatter.format(closingBalance)}\n\n`;

    if (topCategories.length > 0) {
      messageStr += `📂 *Top Pengeluaran:*\n`;
      for (const cat of topCategories) {
        messageStr += `• ${cat.categoryName} — ${formatter.format(cat.total)} (${cat.percentage.toFixed(0)}%)\n`;
      }
      messageStr += `\n`;
    }

    if (budgetSummaryStr) {
      messageStr += budgetSummaryStr;
    }

    if (insight) {
      messageStr += `💡 *Insight:*\n${insight}`;
    } else {
      messageStr += `Semangat mencatat keuangan di bulan ini! 😄`;
    }

    // 8. Kirim via WA
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId: user.phone,
      text: messageStr,
    });

    // 9. Tandai Laporan Terkirim
    await this.db
      .update(reports)
      .set({ sentAt: new Date() })
      .where(eq(reports.id, inserted.id));

    this.logger.info(
      { userId: user.id },
      "Successfully processed monthly report",
    );
  }
}
