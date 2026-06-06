import { getCurrentPeriod } from "@/lib/date-utils";
import {
  budgets,
  getDb,
  transactionCategories,
  transactions,
} from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { formatCurrency } from "@fincore/utils";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

/**
 * Handle /budget cek — list all active budgets with spending status.
 */
export async function handleCheckBudget(
  chatId: string,
  user: { id: string },
): Promise<void> {
  const db = getDb();
  const { month, year, monthName } = getCurrentPeriod();

  const activeBudgets = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.month, month),
        eq(budgets.year, year),
        eq(budgets.isActive, true),
      ),
    );

  if (activeBudgets.length === 0) {
    await sendWaMessage(
      chatId,
      `ℹ️ Kamu belum menetapkan budget sama sekali untuk bulan ${monthName} ${year}. Ketik \`/budget set [kategori] [nominal]\` untuk mulai.`,
    );
    return;
  }

  // Ambil semua transaksi pengeluaran bulan ini
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  const spendingData = await db
    .select({
      categoryId: transactions.categoryId,
      total:
        sql<number>`sum(CAST(${transactions.totalAmount} AS numeric))`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.type, "expense"),
        eq(transactions.isDeleted, false),
        gte(transactions.transactionDate, periodStart),
        lte(transactions.transactionDate, periodEnd),
      ),
    )
    .groupBy(transactions.categoryId);

  const spendingMap = new Map<string, number>();
  for (const s of spendingData) {
    if (s.categoryId) spendingMap.set(s.categoryId, s.total);
  }

  // Get categories names
  const catIds = activeBudgets.map((b) => b.categoryId);
  const cats = await db
    .select({
      id: transactionCategories.id,
      name: transactionCategories.name,
      icon: transactionCategories.icon,
    })
    .from(transactionCategories)
    .where(
      and(
        or(
          isNull(transactionCategories.userId),
          eq(transactionCategories.userId, user.id),
        ),
      ),
    );
  const catMap = new Map(cats.map((c) => [c.id, c]));

  let reply = `📊 *Status Budget Bulan ${monthName} ${year}*\n\n`;

  for (const budget of activeBudgets) {
    const cat = catMap.get(budget.categoryId);
    const name = cat ? `${cat.icon} ${cat.name}` : "Lainnya";
    const limit = Number(budget.amount);
    const spent = spendingMap.get(budget.categoryId) ?? 0;
    const percentage = (spent / limit) * 100;

    let statusIcon = "✅";
    if (percentage >= 100) statusIcon = "🚨 MELAMPAUI!";
    else if (percentage >= 80) statusIcon = "⚠️";

    reply += `*${name}*\nTerpakai: ${formatCurrency(spent, "IDR")} / ${formatCurrency(limit, "IDR")} (${percentage.toFixed(0)}%) ${statusIcon}\n\n`;
  }

  await sendWaMessage(chatId, reply.trim());
}
