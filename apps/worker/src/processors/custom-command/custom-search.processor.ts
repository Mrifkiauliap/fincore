import {
  getDb,
  transactionCategories,
  transactions,
  transactionTagMappings,
  transactionTags,
} from "@fincore/db";
import { sendWaMessage } from "@fincore/queue";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Handles /cari [query] or /cari #[tag]
 */
export async function handleSearchCommand(
  chatId: string,
  userId: string,
  prefix: string,
  lower: string,
  commandText: string,
): Promise<boolean> {
  if (!lower.startsWith(prefix + "cari ")) return false;

  const db = getDb();
  const query = commandText.slice((prefix + "cari ").length).trim();
  const isTagSearch = query.startsWith("#");
  const cleanQuery = query.replace(/^#/, "").trim();

  let results: {
    id: string;
    name: string;
    totalAmount: string;
    transactionDate: Date;
    type: string;
    categoryName: string | null;
  }[] = [];

  if (isTagSearch) {
    const matchingTags = await db
      .select({ id: transactionTags.id })
      .from(transactionTags)
      .where(
        and(
          eq(transactionTags.userId, userId),
          ilike(transactionTags.name, `%${cleanQuery}%`),
        ),
      );

    if (matchingTags.length === 0) {
      await sendWaMessage(
        chatId,
        `Tidak ada transaksi dengan tag *#${cleanQuery}*.`,
      );
      return true;
    }

    const tagIds = matchingTags.map((t) => t.id);
    const mappings = await db
      .select({ transactionId: transactionTagMappings.transactionId })
      .from(transactionTagMappings)
      .where(inArray(transactionTagMappings.tagId, tagIds));

    const txIds = [...new Set(mappings.map((m) => m.transactionId))];
    if (txIds.length === 0) {
      await sendWaMessage(
        chatId,
        `Tidak ada transaksi dengan tag *#${cleanQuery}*.`,
      );
      return true;
    }

    results = await db
      .select({
        id: transactions.id,
        name: transactions.name,
        totalAmount: transactions.totalAmount,
        transactionDate: transactions.transactionDate,
        type: transactions.type,
        categoryName: transactionCategories.name,
      })
      .from(transactions)
      .leftJoin(
        transactionCategories,
        eq(transactions.categoryId, transactionCategories.id),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          inArray(transactions.id, txIds),
        ),
      )
      .orderBy(desc(transactions.transactionDate))
      .limit(5);
  } else {
    results = await db
      .select({
        id: transactions.id,
        name: transactions.name,
        totalAmount: transactions.totalAmount,
        transactionDate: transactions.transactionDate,
        type: transactions.type,
        categoryName: transactionCategories.name,
      })
      .from(transactions)
      .leftJoin(
        transactionCategories,
        eq(transactions.categoryId, transactionCategories.id),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          ilike(transactions.name, `%${cleanQuery}%`),
        ),
      )
      .orderBy(desc(transactions.transactionDate))
      .limit(5);
  }

  if (results.length === 0) {
    await sendWaMessage(
      chatId,
      `Tidak ada transaksi yang cocok dengan *"${query}"*.`,
    );
    return true;
  }

  const formatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  });

  const typeLabel = (t: string) =>
    t === "expense" ? "Keluar" : t === "income" ? "Masuk" : "Transfer";

  let reply = `Hasil pencarian *"${query}"* (${results.length} transaksi):\n\n`;
  for (const tx of results) {
    const date = dayjs(tx.transactionDate)
      .tz("Asia/Jakarta")
      .format("D MMM YYYY");
    const cat = tx.categoryName ? ` · ${tx.categoryName}` : "";
    reply += `• *${tx.name}*\n`;
    reply += `  ${formatter.format(Number(tx.totalAmount))} · ${typeLabel(tx.type)}${cat}\n`;
    reply += `  ${date}\n\n`;
  }

  await sendWaMessage(chatId, reply.trim());
  return true;
}
