/**
 * Build budget summary string for monthly report.
 */
export function buildBudgetSummary(
  userTransactions: Array<{
    type: string;
    categoryId: string | null;
    totalAmount: string;
  }>,
  activeBudgets: Array<{ categoryId: string; amount: string }>,
): string {
  if (activeBudgets.length === 0) return "";

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

  let budgetSummaryStr = `*Ringkasan Budget:*\n`;
  if (safeBudgetCount > 0)
    budgetSummaryStr += `${safeBudgetCount} kategori dalam batas\n`;
  if (overBudgetCount > 0)
    budgetSummaryStr += `${overBudgetCount} kategori melebihi batas\n`;

  return budgetSummaryStr;
}
