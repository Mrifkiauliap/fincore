import { getDb, transactionCategories } from "@fincore/db";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Resolve an expense category by name (fuzzy) for a given user.
 * Used by budget and other command processors.
 */
export async function resolveExpenseCategory(input: string, userId: string) {
  const db = getDb();
  const lower = input.toLowerCase().trim();
  const categories = await db
    .select({
      id: transactionCategories.id,
      name: transactionCategories.name,
    })
    .from(transactionCategories)
    .where(
      and(
        eq(transactionCategories.type, "expense"),
        eq(transactionCategories.isActive, true),
        or(
          isNull(transactionCategories.userId),
          eq(transactionCategories.userId, userId),
        ),
      ),
    );

  // 1. Exact match
  let match = categories.find((c) => c.name.toLowerCase() === lower);
  if (match) return match;

  // 2. Contains match
  match = categories.find(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      lower.includes(c.name.toLowerCase()),
  );
  if (match) return match;

  return null;
}
