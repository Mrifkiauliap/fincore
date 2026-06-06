import { getCurrentPeriod } from "@/lib/date-utils";
import { budgets, getDb, trackEvent } from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { and, eq } from "drizzle-orm";
import { resolveExpenseCategory } from "./budget-category-resolver";

/**
 * Handle /budget hapus [kategori] — deactivate a budget for current month.
 */
export async function handleDeleteBudget(
  chatId: string,
  user: { id: string },
  args: string[],
): Promise<void> {
  const db = getDb();

  if (args.length === 0) {
    await sendWaMessage(
      chatId,
      "⚠️ Kategori belum disebutkan. Contoh: `/budget hapus makan`",
    );
    return;
  }

  const categoryInput = args.join(" ");
  const category = await resolveExpenseCategory(categoryInput, user.id);

  if (!category) {
    await sendWaMessage(
      chatId,
      `⚠️ Kategori pengeluaran "${categoryInput}" tidak ditemukan.`,
    );
    return;
  }

  const { month, year } = getCurrentPeriod();

  await db
    .update(budgets)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, category.id),
        eq(budgets.month, month),
        eq(budgets.year, year),
      ),
    );

  trackEvent({
    category: "user",
    event: "budget.deleted",
    userId: user.id,
  }).catch(() => {});

  await sendWaMessage(
    chatId,
    `🗑️ Budget untuk kategori *${category.name}* bulan ini berhasil dihapus.`,
  );
}
