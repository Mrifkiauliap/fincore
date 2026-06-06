import { BaseProcessor } from "@/processors/base.processor";
import { SumopodProvider } from "@fincore/ai";
import {
  budgets,
  getDb,
  reports,
  trackEvent,
  transactions,
  users,
} from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import dayjs from "dayjs";
import "dayjs/locale/id";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { buildMonthlyReport } from "./monthly-aggregator";
import { buildBudgetSummary } from "./monthly-budget";
import { buildMessage } from "./monthly-message";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

const logger = createLogger("worker:monthly-report");

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
    if (job.name !== JobName.GENERATE_MONTHLY_REPORT) return;

    const { senderPhone } = job.data ?? {};
    const now = new Date();

    let activeUsers = [];
    if (senderPhone) {
      logger.info({ senderPhone }, "Manual trigger for single user");
      activeUsers = await this.db
        .select()
        .from(users)
        .where(eq(users.phone, senderPhone));
    } else {
      logger.info("Starting monthly report generation for all active users...");
      activeUsers = await this.db.select().from(users);
    }
    logger.info({ userCount: activeUsers.length }, "Found active users");

    for (const user of activeUsers) {
      try {
        await this.generateForUser(user, now);
      } catch (err) {
        logger.error(
          { userId: user.id, err },
          "Failed to generate monthly report for user",
        );
      }
    }

    logger.info("Finished monthly report generation");
  }

  private async generateForUser(
    user: { id: string; phone: string },
    nowUtc: Date,
  ) {
    const nowTz = dayjs(nowUtc).tz("Asia/Jakarta");
    const targetMonth = nowTz.subtract(1, "month");
    const periodStart = targetMonth.startOf("month").toDate();
    const periodEnd = targetMonth.endOf("month").toDate();

    // 2. Idempotency check
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
      logger.info(
        { userId: user.id },
        "Report for this period already exists, skipping...",
      );
      return;
    }

    // 3. Carry-Forward
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

    // 4. Aggregate
    const {
      reportData,
      totalIncome,
      totalExpense,
      totalTransfer,
      topCategories,
    } = await buildMonthlyReport(user.id, periodStart, periodEnd);

    if (reportData.transactionCount === 0 && openingBalance === 0) {
      logger.info(
        { userId: user.id },
        "No transactions and no opening balance. Skipping report.",
      );
      return;
    }

    const closingBalance = openingBalance + totalIncome - totalExpense;

    // 5. AI Insight
    let insight = "";
    if (reportData.transactionCount > 0) {
      insight = await this.ai.generateSummary({
        openingBalance,
        totalIncome,
        totalExpense,
        topExpenses: topCategories,
        closingBalance,
      });
    }

    // 4.5 Budget status
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

    // Fetch transactions for budget calc
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

    const budgetSummaryStr = buildBudgetSummary(
      userTransactions,
      activeBudgets,
    );

    // 6. Save report
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
        sentAt: null,
      })
      .returning();

    trackEvent({
      category: "system",
      event: "report.monthly.generated",
      userId: user.id,
    }).catch(() => {});

    // 7. Format & send message
    const monthName = periodStart.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });

    const messageStr = buildMessage({
      monthName,
      openingBalance,
      totalIncome,
      totalExpense,
      totalTransfer,
      closingBalance,
      topCategories,
      budgetSummaryStr,
      insight,
    });

    await sendWaMessage(user.phone, messageStr);

    // 8. Mark sent
    await this.db
      .update(reports)
      .set({ sentAt: new Date() })
      .where(eq(reports.id, inserted.id));

    trackEvent({
      category: "system",
      event: "report.monthly.sent",
      userId: user.id,
    }).catch(() => {});

    logger.info({ userId: user.id }, "Successfully processed monthly report");
  }
}
