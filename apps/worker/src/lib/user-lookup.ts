import { getDb, users } from "@fincore/db";
import { eq } from "drizzle-orm";

/**
 * Shared user lookup by phone. Eliminates DRY violation across
 * transaction-command, budget-command, report, message, and other processors.
 */
export async function findUserByPhone(phone: string) {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  return user ?? null;
}
