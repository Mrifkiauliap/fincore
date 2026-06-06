import { getDb, transactions, type ReportData } from "@fincore/db";
import { and, eq, gte, lte } from "drizzle-orm";

/**
 * Aggregate monthly data: totals, breakdown, top categories.
 */
export async function buildMonthlyReport(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{
  reportData: ReportData;
  totalIncome: number;
  totalExpense: number;
  totalTransfer: number;
  topCategories: { categoryName: string; total: number; percentage: number }[];
}> {
  const db = getDb();
  const userTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        gte(transactions.transactionDate, periodStart),
        lte(transactions.transactionDate, periodEnd),
      ),
    );

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
    breakdown: [],
    topCategories,
    transactionCount: userTransactions.length,
  };

  return {
    reportData,
    totalIncome,
    totalExpense,
    totalTransfer,
    topCategories,
  };
}
