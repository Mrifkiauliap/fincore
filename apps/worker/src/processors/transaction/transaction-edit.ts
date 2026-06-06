import { getDb, transactions } from "@fincore/db";
import { formatCurrency } from "@fincore/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, ilike } from "drizzle-orm";
import {
  PendingActionState,
  pendingActionKey,
  PENDING_ACTION_TTL,
} from "./transaction-pending";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Search transaction candidates for editing.
 */
export async function handleEditSearch(
  chatId: string,
  userId: string,
  query: string,
  valkey: {
    setex: (key: string, ttl: number, value: string) => Promise<unknown>;
  },
  sendWa: (chatId: string, text: string) => Promise<void>,
) {
  const db = getDb();
  const candidates = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        ilike(transactions.name, `%${query}%`),
      ),
    )
    .orderBy(desc(transactions.transactionDate))
    .limit(5);

  if (candidates.length === 0) {
    return sendWa(
      chatId,
      `Tidak ada transaksi dengan kata kunci *"${query}"*.`,
    );
  }

  let reply = `Pilih transaksi yang ingin diubah:\n\n`;
  for (const [i, tx] of candidates.entries()) {
    const dateStr = dayjs(tx.transactionDate)
      .tz("Asia/Jakarta")
      .format("DD MMM");
    reply += `*${i + 1}.* ${tx.name} - ${formatCurrency(Number(tx.totalAmount), "IDR")} (${dateStr})\n`;
  }
  reply += `\nBalas nomor (1–${candidates.length}) atau *batal*.`;

  const state: PendingActionState = {
    action: "ubah_select",
    transactionIds: candidates.map((tx) => tx.id),
  };
  await valkey.setex(
    pendingActionKey(chatId),
    PENDING_ACTION_TTL,
    JSON.stringify(state),
  );
  await sendWa(chatId, reply);
}
