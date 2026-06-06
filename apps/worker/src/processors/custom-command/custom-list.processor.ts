import { getDb, paymentMethods, transactionCategories } from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import { and, asc, eq, isNull, or } from "drizzle-orm";

/**
 * Handles /lihat metode and /lihat kategori [type?]
 */
export async function handleListCommand(
  chatId: string,
  userId: string,
  prefix: string,
  lower: string,
): Promise<boolean> {
  const db = getDb();

  // /lihat metode
  if (
    lower === prefix + "lihat metode" ||
    lower.startsWith(prefix + "lihat metode ")
  ) {
    await listPaymentMethods(db, chatId, userId);
    return true;
  }

  // /lihat kategori
  if (
    lower === prefix + "lihat kategori" ||
    lower.startsWith(prefix + "lihat kategori ")
  ) {
    const typeFilter = lower.startsWith(prefix + "lihat kategori ")
      ? lower.slice((prefix + "lihat kategori ").length).trim()
      : null;
    await listCategories(db, chatId, userId, typeFilter);
    return true;
  }

  return false;
}

async function listPaymentMethods(
  db: ReturnType<typeof getDb>,
  chatId: string,
  userId: string,
) {
  const methods = await db
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.isActive, true),
        or(isNull(paymentMethods.userId), eq(paymentMethods.userId, userId)),
      ),
    )
    .orderBy(asc(paymentMethods.name));

  if (methods.length === 0) {
    return sendWaMessage(chatId, "ℹ️ Belum ada metode pembayaran tersimpan.");
  }

  const globals: typeof methods = [];
  const custom: typeof methods = [];
  for (const m of methods) {
    if (!m.userId) globals.push(m);
    else if (m.userId === userId) custom.push(m);
  }

  let reply = `💳 *Metode Pembayaran*\n\n`;

  if (globals.length > 0) {
    reply += `*Global:*\n`;
    for (const m of globals) {
      reply += `• ${m.icon ?? "💳"} ${m.name}\n`;
    }
  }

  if (custom.length > 0) {
    reply += `\n*Custom kamu:*\n`;
    for (const m of custom) {
      reply += `• ${m.icon ?? "💳"} ${m.name}\n`;
    }
  }

  await sendWaMessage(chatId, reply.trim());
}

async function listCategories(
  db: ReturnType<typeof getDb>,
  chatId: string,
  userId: string,
  typeFilter: string | null,
) {
  const validType =
    typeFilter === "expense" ||
    typeFilter === "income" ||
    typeFilter === "transfer"
      ? typeFilter
      : null;

  const whereClause = validType
    ? and(
        eq(transactionCategories.isActive, true),
        eq(transactionCategories.type, validType),
        or(
          isNull(transactionCategories.userId),
          eq(transactionCategories.userId, userId),
        ),
      )
    : and(
        eq(transactionCategories.isActive, true),
        or(
          isNull(transactionCategories.userId),
          eq(transactionCategories.userId, userId),
        ),
      );

  const cats = await db
    .select()
    .from(transactionCategories)
    .where(whereClause)
    .orderBy(
      asc(transactionCategories.type),
      asc(transactionCategories.sortOrder),
    );

  if (cats.length === 0) {
    return sendWaMessage(chatId, "ℹ️ Belum ada kategori tersimpan.");
  }

  const grouped: Record<string, typeof cats> = {};
  for (const cat of cats) {
    if (!grouped[cat.type]) grouped[cat.type] = [];
    grouped[cat.type].push(cat);
  }

  const typeLabels: Record<string, string> = {
    expense: "💸 Pengeluaran",
    income: "💰 Pemasukan",
    transfer: "🔄 Transfer",
  };

  let reply = `📂 *Daftar Kategori*\n\n`;
  for (const [type, items] of Object.entries(grouped)) {
    reply += `*${typeLabels[type] ?? type}:*\n`;
    for (const c of items) {
      const tag = c.userId ? " _(custom)_" : "";
      reply += `• ${c.icon ?? "•"} ${c.name}${tag}\n`;
    }
    reply += `\n`;
  }

  await sendWaMessage(chatId, reply.trim());
}
