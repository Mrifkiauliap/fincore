import { getDb, transactions } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { formatCurrency } from "@fincore/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, ilike } from "drizzle-orm";
import {
  PENDING_ACTION_TTL,
  PendingActionState,
  pendingActionKey,
} from "./transaction-pending";

dayjs.extend(utc);
dayjs.extend(timezone);

const logger = createLogger("processor:transaction-delete");

/**
 * Delete last confirmed transaction. Stores confirmation state in Valkey.
 */
export async function handleDeleteLast(
  chatId: string,
  userId: string,
  valkey: {
    setex: (key: string, ttl: number, value: string) => Promise<unknown>;
  },
  sendWa: (chatId: string, text: string) => Promise<void>,
) {
  const db = getDb();
  const [last] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        eq(transactions.isConfirmed, true),
      ),
    )
    .orderBy(desc(transactions.transactionDate))
    .limit(1);

  if (!last) {
    return sendWa(chatId, "ℹ️ Tidak ada transaksi yang bisa dihapus.");
  }

  const dateStr = dayjs(last.transactionDate)
    .tz("Asia/Jakarta")
    .format("DD MMM YYYY");
  const description = `*${last.name}* - ${formatCurrency(Number(last.totalAmount), "IDR")} (${dateStr})`;

  const state: PendingActionState = {
    action: "confirm_delete",
    transactionIds: [last.id],
    description,
  };
  await valkey.setex(
    pendingActionKey(chatId),
    PENDING_ACTION_TTL,
    JSON.stringify(state),
  );

  await sendWa(
    chatId,
    `🗑️ Hapus transaksi berikut?\n\n${description}\n\nBalas *ya* untuk konfirmasi atau *tidak* untuk batal.`,
  );
}

/**
 * Search transactions matching query for deletion candidates.
 */
export async function handleDeleteSearch(
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
      `ℹ️ Tidak ada transaksi dengan kata kunci *"${query}"*.`,
    );
  }

  let reply = `🔍 Ditemukan *${candidates.length}* transaksi. Pilih nomor yang ingin dihapus:\n\n`;
  for (const [i, tx] of candidates.entries()) {
    const dateStr = dayjs(tx.transactionDate)
      .tz("Asia/Jakarta")
      .format("DD MMM");
    reply += `*${i + 1}.* ${tx.name} - ${formatCurrency(Number(tx.totalAmount), "IDR")} (${dateStr})\n`;
  }
  reply += `\nBalas dengan nomor (1–${candidates.length}) atau *batal*.`;

  const state: PendingActionState = {
    action: "select_candidate",
    transactionIds: candidates.map((tx) => tx.id),
  };
  await valkey.setex(
    pendingActionKey(chatId),
    PENDING_ACTION_TTL,
    JSON.stringify(state),
  );

  await sendWa(chatId, reply);
}
