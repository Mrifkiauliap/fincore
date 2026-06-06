import { fmtCurrency } from "@/lib/date-utils";
import { getDb, transactions } from "@fincore/db";
import dayjs from "dayjs";
import { and, between, desc, eq, sql } from "drizzle-orm";

/**
 * Build AI-driven summary report for a given period.
 * Shows totals per type + top 3 recent transactions.
 */
export async function buildSummaryReport(
  userId: string,
  parsed: { transaction_type: string | null },
  periodLabel: string,
  dateFrom: Date,
  dateTo: Date,
  userTimezone: string = "Asia/Jakarta",
): Promise<string> {
  const db = getDb();

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`SUM(${transactions.totalAmount})`,
      count: sql<string>`COUNT(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        between(transactions.transactionDate, dateFrom, dateTo),
      ),
    )
    .groupBy(transactions.type);

  const income = rows.find((r) => r.type === "income");
  const expense = rows.find((r) => r.type === "expense");
  const transfer = rows.find((r) => r.type === "transfer");

  const totalIncome = parseFloat(income?.total ?? "0");
  const totalExpense = parseFloat(expense?.total ?? "0");
  const totalTransfer = parseFloat(transfer?.total ?? "0");
  const balance = totalIncome - totalExpense;

  const typeFilter = parsed.transaction_type;

  const lines: string[] = [`*Laporan ${periodLabel}*`, ""];

  if (!typeFilter || typeFilter === "income") {
    lines.push(
      `Pemasukan: ${fmtCurrency(totalIncome)} (${income?.count ?? 0}x)`,
    );
  }
  if (!typeFilter || typeFilter === "expense") {
    lines.push(
      `Pengeluaran: ${fmtCurrency(totalExpense)} (${expense?.count ?? 0}x)`,
    );
  }
  if (!typeFilter || typeFilter === "transfer") {
    lines.push(
      `Transfer: ${fmtCurrency(totalTransfer)} (${transfer?.count ?? 0}x)`,
    );
  }
  if (!typeFilter) {
    lines.push(
      "",
      `Selisih: ${balance >= 0 ? "+" : ""}${fmtCurrency(balance)}`,
    );
  }

  // Top 3 transactions for context
  const recent = await db
    .select({
      type: transactions.type,
      amount: transactions.totalAmount,
      merchant: transactions.merchant,
      notes: transactions.notes,
      transactionDate: transactions.transactionDate,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        between(transactions.transactionDate, dateFrom, dateTo),
        ...(typeFilter
          ? [
              eq(
                transactions.type,
                typeFilter as "expense" | "income" | "transfer",
              ),
            ]
          : []),
      ),
    )
    .orderBy(desc(transactions.transactionDate))
    .limit(3);

  if (recent.length > 0) {
    lines.push("", "Transaksi terakhir:");
    for (const t of recent) {
      const label = t.merchant ?? t.notes ?? t.type;
      const dateStr = dayjs(t.transactionDate).tz(userTimezone).format("D MMM");
      lines.push(`- ${dateStr}: ${label} ${fmtCurrency(parseFloat(t.amount))}`);
    }
  }

  return lines.join("\n");
}
