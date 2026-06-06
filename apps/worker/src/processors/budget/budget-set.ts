import { getCurrentPeriod } from "@/lib/date-utils";
import { budgets, getDb, trackEvent } from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { formatCurrency } from "@fincore/utils";
import { and, eq } from "drizzle-orm";
import { resolveExpenseCategory } from "./budget-category-resolver";

/**
 * Handle /budget set [kategori] [nominal]
 */
export async function handleSetBudget(
  chatId: string,
  user: { id: string },
  args: string[],
): Promise<void> {
  const db = getDb();

  if (args.length < 2) {
    await sendWaMessage(
      chatId,
      "⚠️ Format salah. Contoh: `/budget set makan 1000000`",
    );
    return;
  }

  const amountStr = args.pop()!;
  const nominal = parseInt(amountStr.replace(/\D/g, ""), 10);
  if (isNaN(nominal) || nominal <= 0) {
    await sendWaMessage(chatId, "⚠️ Nominal budget tidak valid.");
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

  // Upsert budget
  const [existing] = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, user.id),
        eq(budgets.categoryId, category.id),
        eq(budgets.month, month),
        eq(budgets.year, year),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(budgets)
      .set({
        amount: nominal.toString(),
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(budgets.id, existing.id));
  } else {
    await db.insert(budgets).values({
      userId: user.id,
      categoryId: category.id,
      amount: nominal.toString(),
      month,
      year,
    });
  }

  trackEvent({
    category: "user",
    event: "budget.set",
    userId: user.id,
  }).catch(() => {});

  await sendWaMessage(
    chatId,
    `✅ Budget untuk kategori *${category.name}* berhasil diset ke ${formatCurrency(nominal, "IDR")} untuk bulan ini.`,
  );
}
