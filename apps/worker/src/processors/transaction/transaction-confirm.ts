import { getDb, transactions } from "@fincore/db";
import { formatCurrency } from "@fincore/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq } from "drizzle-orm";
import {
  PENDING_ACTION_TTL,
  PendingActionState,
  pendingActionKey,
} from "./transaction-pending";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * List pending (unconfirmed) transactions for user to confirm.
 */
export async function handleListPendingConfirmations(
  chatId: string,
  userId: string,
  valkey: {
    setex: (key: string, ttl: number, value: string) => Promise<unknown>;
  },
  sendWa: (chatId: string, text: string) => Promise<void>,
) {
  const db = getDb();
  const pending = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.isDeleted, false),
        eq(transactions.isConfirmed, false),
      ),
    )
    .orderBy(desc(transactions.transactionDate))
    .limit(10);

  if (pending.length === 0) {
    return sendWa(chatId, "✅ Tidak ada transaksi yang menunggu konfirmasi.");
  }

  let reply = `📋 *${pending.length} transaksi menunggu konfirmasi:*\n\n`;
  for (const [i, tx] of pending.entries()) {
    const dateStr = dayjs(tx.transactionDate)
      .tz("Asia/Jakarta")
      .format("DD MMM");
    reply += `*${i + 1}.* ${tx.name} - ${formatCurrency(Number(tx.totalAmount), "IDR")} (${dateStr})\n`;
  }
  reply += `\nBalas nomor untuk konfirmasi satu, atau *semua* untuk konfirmasi semuanya.`;

  const state: PendingActionState = {
    action: "select_candidate",
    transactionIds: pending.map((tx) => tx.id),
  };
  await valkey.setex(
    pendingActionKey(chatId),
    PENDING_ACTION_TTL,
    JSON.stringify(state),
  );

  await sendWa(chatId, reply);
}
