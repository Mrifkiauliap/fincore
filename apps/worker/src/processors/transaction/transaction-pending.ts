import { getDb, trackEvent, transactions } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { and, eq } from "drizzle-orm";

const logger = createLogger("processor:transaction-pending");

export const PENDING_ACTION_TTL = 5 * 60;
export const pendingActionKey = (chatId: string) =>
  `fincore:pending_action:${chatId}`;

export interface PendingActionState {
  action: "confirm_delete" | "select_candidate" | "ubah_select" | "ubah_input";
  transactionIds: string[];
  description?: string;
  selectedId?: string;
}

/**
 * State machine handler for pending action answers.
 * Routes answers (ya/tidak/numbers) to the correct mutation.
 */
export async function handlePendingAction(
  chatId: string,
  userId: string,
  state: PendingActionState,
  answer: string,
  valkey: {
    setex: (key: string, ttl: number, value: string) => Promise<unknown>;
    del: (key: string) => Promise<unknown>;
  },
  sendWa: (chatId: string, text: string) => Promise<void>,
): Promise<void> {
  const db = getDb();
  const isCancelled = ["tidak", "batal", "cancel", "no"].includes(
    answer.trim(),
  );
  const isAll = ["semua", "all"].includes(answer.trim());

  if (isCancelled) {
    await valkey.del(pendingActionKey(chatId));
    await sendWa(chatId, "Oke, dibatalkan.");
    return;
  }

  // ─── ubah_select: user pilih nomor transaksi yg mau diedit
  if (state.action === "ubah_select") {
    const num = parseInt(answer.trim(), 10);
    if (isNaN(num) || num < 1 || num > state.transactionIds.length) {
      await sendWa(
        chatId,
        `Masukkan nomor antara 1–${state.transactionIds.length} atau *batal*.`,
      );
      return;
    }
    const selectedId = state.transactionIds[num - 1];
    const [tx] = await db
      .select({
        name: transactions.name,
        totalAmount: transactions.totalAmount,
      })
      .from(transactions)
      .where(eq(transactions.id, selectedId))
      .limit(1);

    const newState: PendingActionState = {
      action: "ubah_input",
      transactionIds: state.transactionIds,
      selectedId,
      description: tx?.name,
    };
    await valkey.setex(
      pendingActionKey(chatId),
      PENDING_ACTION_TTL,
      JSON.stringify(newState),
    );

    const fmt = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    await sendWa(
      chatId,
      `Mengubah: *${tx?.name}* (${fmt.format(Number(tx?.totalAmount ?? 0))})\n\n` +
        `Ketik nilai baru. Contoh:\n` +
        `• \`75000\` - ubah nominal\n` +
        `• \`Makan Siang\` - ubah nama\n` +
        `• \`75000 Makan Siang\` - ubah keduanya\n\n` +
        `Atau balas *batal* untuk membatalkan.`,
    );
    return;
  }

  // ─── ubah_input: user kirim nilai baru
  if (state.action === "ubah_input" && state.selectedId) {
    await handleEditInputInternal(
      chatId,
      userId,
      state.selectedId,
      answer,
      valkey,
      sendWa,
    );
    return;
  }

  if (state.action === "confirm_delete") {
    const isConfirmed = ["ya", "iya", "yes", "oke", "ok", "yep"].includes(
      answer.trim(),
    );
    if (!isConfirmed) {
      await sendWa(
        chatId,
        "Balas *ya* untuk konfirmasi hapus, atau *tidak* untuk batal.",
      );
      return;
    }

    await db
      .update(transactions)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.id, state.transactionIds[0]),
          eq(transactions.userId, userId),
        ),
      );

    await valkey.del(pendingActionKey(chatId));

    trackEvent({
      category: "transaction",
      event: "transaction.deleted",
      userId,
    }).catch(() => {});

    await sendWa(chatId, "🗑️ Transaksi berhasil dihapus.");
    return;
  }

  if (state.action === "select_candidate") {
    if (isAll) {
      await db
        .update(transactions)
        .set({ isConfirmed: true, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.isConfirmed, false),
            eq(transactions.isDeleted, false),
          ),
        );
      await valkey.del(pendingActionKey(chatId));
      await sendWa(chatId, "✅ Semua transaksi berhasil dikonfirmasi.");
      return;
    }

    const num = parseInt(answer.trim(), 10);
    if (isNaN(num) || num < 1 || num > state.transactionIds.length) {
      await sendWa(
        chatId,
        `⚠️ Masukkan nomor antara 1–${state.transactionIds.length} atau *batal*.`,
      );
      return;
    }

    const selectedId = state.transactionIds[num - 1];

    const [tx] = await db
      .select({
        isConfirmed: transactions.isConfirmed,
        name: transactions.name,
      })
      .from(transactions)
      .where(eq(transactions.id, selectedId))
      .limit(1);

    if (!tx) {
      await valkey.del(pendingActionKey(chatId));
      await sendWa(chatId, "Transaksi tidak ditemukan.");
      return;
    }

    if (!tx.isConfirmed) {
      await db
        .update(transactions)
        .set({ isConfirmed: true, updatedAt: new Date() })
        .where(eq(transactions.id, selectedId));

      await valkey.del(pendingActionKey(chatId));
      await sendWa(chatId, `✅ Transaksi *${tx.name}* berhasil dikonfirmasi.`);
    } else {
      const newState: PendingActionState = {
        action: "confirm_delete",
        transactionIds: [selectedId],
        description: tx.name,
      };
      await valkey.setex(
        pendingActionKey(chatId),
        PENDING_ACTION_TTL,
        JSON.stringify(newState),
      );
      await sendWa(
        chatId,
        `🗑️ Yakin ingin hapus transaksi *${tx.name}*?\nBalas *ya* atau *tidak*.`,
      );
    }
  }
}

/** Internal edit input handler (not exported, used by handlePendingAction) */
async function handleEditInputInternal(
  chatId: string,
  userId: string,
  selectedId: string,
  input: string,
  valkey: { del: (key: string) => Promise<unknown> },
  sendWa: (chatId: string, text: string) => Promise<void>,
) {
  const db = getDb();

  const amountMatch = input.match(/^(\d[\d.,]*)/);
  let newAmount: number | null = null;
  let newName: string | null = null;

  if (amountMatch) {
    const raw = amountMatch[1].replace(/[.,]/g, "");
    newAmount = parseInt(raw, 10);
    const rest = input.slice(amountMatch[0].length).trim();
    if (rest.length > 1) newName = rest;
  } else {
    newName = input.trim();
  }

  if (!newAmount && !newName) {
    await sendWa(
      chatId,
      "Format tidak dikenali. Contoh:\n• `50000` - ubah nominal\n• `Makan Bakso` - ubah nama\n• `50000 Makan Bakso` - ubah keduanya",
    );
    return;
  }

  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (newAmount) {
    updateFields.amount = String(newAmount);
    updateFields.totalAmount = String(newAmount);
  }
  if (newName) updateFields.name = newName;

  await db
    .update(transactions)
    .set(updateFields as typeof transactions.$inferInsert)
    .where(
      and(eq(transactions.id, selectedId), eq(transactions.userId, userId)),
    );

  await valkey.del(pendingActionKey(chatId));

  trackEvent({
    category: "transaction",
    event: "transaction.updated",
    userId,
  }).catch(() => {});

  const parts: string[] = [];
  if (newName) parts.push(`nama > *${newName}*`);
  if (newAmount) {
    const fmt = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    parts.push(`nominal > *${fmt.format(newAmount)}*`);
  }

  await sendWa(chatId, `Transaksi diperbarui: ${parts.join(", ")}.`);
}
