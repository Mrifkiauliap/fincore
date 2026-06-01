import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { getDb, transactions, users } from "@fincore/db";
import { createValkeyConnection, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, desc, eq, ilike } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface TransactionCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

/** State yang disimpan di Valkey saat menunggu jawaban user */
export interface PendingActionState {
  action: "confirm_delete" | "select_candidate" | "ubah_select" | "ubah_input";
  transactionIds: string[];
  /** Deskripsi singkat untuk ditampilkan ke user */
  description?: string;
  /** Untuk ubah_input: ID transaksi yang dipilih */
  selectedId?: string;
}

const PENDING_ACTION_TTL = 5 * 60; // 5 menit
export const pendingActionKey = (chatId: string) =>
  `fincore:pending_action:${chatId}`;

@Injectable()
export class TransactionCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.TRANSACTION_COMMAND;
  private readonly db = getDb();
  private readonly valkey = createValkeyConnection();
  private readonly prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  constructor() {
    super("worker:transaction-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<TransactionCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_TRANSACTION_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    // 1. Ambil user
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    if (!user) {
      return sendWaMessage(
        chatId,
        "Pengguna tidak ditemukan. Kirim pesan apapun terlebih dahulu untuk registrasi.",
      );
    }

    const lower = commandText.toLowerCase().trim();

    // 2. Cek apakah ini jawaban dari pending_action
    const rawPending = await this.valkey.get(pendingActionKey(chatId));
    if (rawPending) {
      const state = JSON.parse(rawPending) as PendingActionState;
      await this.handlePendingAction(chatId, user.id, state, lower);
      return;
    }

    // 3. Parse command
    if (
      lower === this.prefix + "hapus" ||
      lower === this.prefix + "hapus terakhir"
    ) {
      await this.handleDeleteLast(chatId, user.id);
      return;
    }

    if (lower.startsWith(this.prefix + "hapus ")) {
      const query = commandText.slice((this.prefix + "hapus ").length).trim();
      await this.handleDeleteSearch(chatId, user.id, query);
      return;
    }

    if (
      lower === this.prefix + "konfirmasi" ||
      lower === this.prefix + "konfirmasi semua"
    ) {
      await this.handleListPendingConfirmations(chatId, user.id);
      return;
    }

    // /ubah [query]
    if (lower.startsWith(this.prefix + "ubah ")) {
      const query = commandText.slice((this.prefix + "ubah ").length).trim();
      await this.handleEditSearch(chatId, user.id, query);
      return;
    }

    await sendWaMessage(
      chatId,
      "❓ Perintah tidak dikenali.\n\nContoh:\n" +
        `• \`${this.prefix}hapus\` - hapus transaksi terakhir\n` +
        `• \`${this.prefix}hapus makan\` - cari transaksi untuk dihapus\n` +
        `• \`${this.prefix}ubah bakso\` - ubah transaksi\n` +
        `• \`${this.prefix}konfirmasi\` - lihat transaksi pending konfirmasi`,
    );
  }

  // ─── HAPUS TRANSAKSI TERAKHIR ─────────────────────────────────────────────

  private async handleDeleteLast(chatId: string, userId: string) {
    const [last] = await this.db
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
      return sendWaMessage(chatId, "ℹ️ Tidak ada transaksi yang bisa dihapus.");
    }

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });

    const tz = await this.getUserTimezone(userId);
    const dateStr = dayjs(last.transactionDate).tz(tz).format("DD MMM YYYY");
    const description = `*${last.name}* - ${formatter.format(Number(last.totalAmount))} (${dateStr})`;

    // Simpan state konfirmasi ke Valkey
    const state: PendingActionState = {
      action: "confirm_delete",
      transactionIds: [last.id],
      description,
    };
    await this.valkey.setex(
      pendingActionKey(chatId),
      PENDING_ACTION_TTL,
      JSON.stringify(state),
    );

    await sendWaMessage(
      chatId,
      `🗑️ Hapus transaksi berikut?\n\n${description}\n\nBalas *ya* untuk konfirmasi atau *tidak* untuk batal.`,
    );
  }

  // ─── CARI TRANSAKSI UNTUK DIHAPUS ────────────────────────────────────────

  private async handleDeleteSearch(
    chatId: string,
    userId: string,
    query: string,
  ) {
    const candidates = await this.db
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
      return sendWaMessage(
        chatId,
        `ℹ️ Tidak ada transaksi dengan kata kunci *"${query}"*.`,
      );
    }

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    const tz = await this.getUserTimezone(userId);

    let reply = `🔍 Ditemukan *${candidates.length}* transaksi. Pilih nomor yang ingin dihapus:\n\n`;
    for (const [i, tx] of candidates.entries()) {
      const dateStr = dayjs(tx.transactionDate).tz(tz).format("DD MMM");
      reply += `*${i + 1}.* ${tx.name} - ${formatter.format(Number(tx.totalAmount))} (${dateStr})\n`;
    }
    reply += `\nBalas dengan nomor (1–${candidates.length}) atau *batal*.`;

    const transactionIds = [];
    for (const tx of candidates) {
      transactionIds.push(tx.id);
    }

    // Simpan kandidat ke Valkey
    const state: PendingActionState = {
      action: "select_candidate",
      transactionIds,
    };
    await this.valkey.setex(
      pendingActionKey(chatId),
      PENDING_ACTION_TTL,
      JSON.stringify(state),
    );

    await sendWaMessage(chatId, reply);
  }

  // ─── KONFIRMASI TRANSAKSI PENDING ─────────────────────────────────────────

  private async handleListPendingConfirmations(chatId: string, userId: string) {
    const pending = await this.db
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
      return sendWaMessage(
        chatId,
        "✅ Tidak ada transaksi yang menunggu konfirmasi.",
      );
    }

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    const tz = await this.getUserTimezone(userId);

    let reply = `📋 *${pending.length} transaksi menunggu konfirmasi:*\n\n`;
    for (const [i, tx] of pending.entries()) {
      const dateStr = dayjs(tx.transactionDate).tz(tz).format("DD MMM");
      reply += `*${i + 1}.* ${tx.name} - ${formatter.format(Number(tx.totalAmount))} (${dateStr})\n`;
    }
    reply += `\nBalas nomor untuk konfirmasi satu, atau *semua* untuk konfirmasi semuanya.`;

    const transactionIds = [];
    for (const tx of pending) {
      transactionIds.push(tx.id);
    }

    const state: PendingActionState = {
      action: "select_candidate",
      transactionIds,
    };
    await this.valkey.setex(
      pendingActionKey(chatId),
      PENDING_ACTION_TTL,
      JSON.stringify(state),
    );

    await sendWaMessage(chatId, reply);
  }

  // ─── EDIT TRANSAKSI (/ubah) ───────────────────────────────────────────────────

  /** Cari kandidat transaksi yang ingin diedit */
  private async handleEditSearch(
    chatId: string,
    userId: string,
    query: string,
  ) {
    const candidates = await this.db
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
      return sendWaMessage(
        chatId,
        `Tidak ada transaksi dengan kata kunci *"${query}"*.`,
      );
    }

    const formatter = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    });
    const tz = await this.getUserTimezone(userId);

    let reply = `Pilih transaksi yang ingin diubah:\n\n`;
    for (const [i, tx] of candidates.entries()) {
      const dateStr = dayjs(tx.transactionDate).tz(tz).format("DD MMM");
      reply += `*${i + 1}.* ${tx.name} - ${formatter.format(Number(tx.totalAmount))} (${dateStr})\n`;
    }
    reply += `\nBalas nomor (1–${candidates.length}) atau *batal*.`;

    const state: PendingActionState = {
      action: "ubah_select",
      transactionIds: candidates.map((tx) => tx.id),
    };
    await this.valkey.setex(
      pendingActionKey(chatId),
      PENDING_ACTION_TTL,
      JSON.stringify(state),
    );
    await sendWaMessage(chatId, reply);
  }

  /** Proses input perubahan setelah user pilih transaksi */
  private async handleEditInput(
    chatId: string,
    userId: string,
    selectedId: string,
    input: string,
  ) {
    // Parse: bisa "50000", "Nama Baru", atau "50000 Nama Baru"
    // Coba match angka di depan
    const amountMatch = input.match(/^(\d[\d.,]*)/);
    let newAmount: number | null = null;
    let newName: string | null = null;

    if (amountMatch) {
      const raw = amountMatch[1].replace(/[.,]/g, "");
      newAmount = parseInt(raw, 10);
      const rest = input.slice(amountMatch[0].length).trim();
      if (rest.length > 1) newName = rest;
    } else {
      // Semua teks = nama baru
      newName = input.trim();
    }

    if (!newAmount && !newName) {
      return sendWaMessage(
        chatId,
        "Format tidak dikenali. Contoh:\n• `50000` - ubah nominal\n• `Makan Bakso` - ubah nama\n• `50000 Makan Bakso` - ubah keduanya",
      );
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (newAmount) {
      updateFields.amount = String(newAmount);
      updateFields.totalAmount = String(newAmount); // simplified (no fee recalc)
    }
    if (newName) updateFields.name = newName;

    await this.db
      .update(transactions)
      .set(updateFields as any)
      .where(
        and(eq(transactions.id, selectedId), eq(transactions.userId, userId)),
      );

    await this.valkey.del(pendingActionKey(chatId));

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

    return sendWaMessage(chatId, `Transaksi diperbarui: ${parts.join(", ")}.`);
  }

  // ─── HANDLE JAWABAN ATAS PENDING ACTION ───────────────────────────────────────────

  private async handlePendingAction(
    chatId: string,
    userId: string,
    state: PendingActionState,
    answer: string,
  ) {
    const isCancelled = ["tidak", "batal", "cancel", "no"].includes(
      answer.trim(),
    );
    const isAll = ["semua", "all"].includes(answer.trim());

    if (isCancelled) {
      await this.valkey.del(pendingActionKey(chatId));
      return sendWaMessage(chatId, "Oke, dibatalkan.");
    }

    // ─── ubah_select: user pilih nomor transaksi yg mau diedit
    if (state.action === "ubah_select") {
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > state.transactionIds.length) {
        return sendWaMessage(
          chatId,
          `Masukkan nomor antara 1–${state.transactionIds.length} atau *batal*.`,
        );
      }
      const selectedId = state.transactionIds[num - 1];
      const [tx] = await this.db
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
      await this.valkey.setex(
        pendingActionKey(chatId),
        PENDING_ACTION_TTL,
        JSON.stringify(newState),
      );

      const fmt = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      });
      return sendWaMessage(
        chatId,
        `Mengubah: *${tx?.name}* (${fmt.format(Number(tx?.totalAmount ?? 0))})\n\n` +
          `Ketik nilai baru. Contoh:\n` +
          `• \`75000\` - ubah nominal\n` +
          `• \`Makan Siang\` - ubah nama\n` +
          `• \`75000 Makan Siang\` - ubah keduanya\n\n` +
          `Atau balas *batal* untuk membatalkan.`,
      );
    }

    // ─── ubah_input: user kirim nilai baru
    if (state.action === "ubah_input" && state.selectedId) {
      return this.handleEditInput(chatId, userId, state.selectedId, answer);
    }

    if (state.action === "confirm_delete") {
      const isConfirmed = ["ya", "iya", "yes", "oke", "ok", "yep"].includes(
        answer.trim(),
      );
      if (!isConfirmed) {
        return sendWaMessage(
          chatId,
          "Balas *ya* untuk konfirmasi hapus, atau *tidak* untuk batal.",
        );
      }

      await this.db
        .update(transactions)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.id, state.transactionIds[0]),
            eq(transactions.userId, userId),
          ),
        );

      await this.valkey.del(pendingActionKey(chatId));
      return sendWaMessage(chatId, "🗑️ Transaksi berhasil dihapus.");
    }

    if (state.action === "select_candidate") {
      // Mode konfirmasi massal: konfirmasi semua
      if (isAll) {
        await this.db
          .update(transactions)
          .set({ isConfirmed: true, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.isConfirmed, false),
              eq(transactions.isDeleted, false),
            ),
          );
        await this.valkey.del(pendingActionKey(chatId));
        return sendWaMessage(
          chatId,
          "✅ Semua transaksi berhasil dikonfirmasi.",
        );
      }

      // Pilih nomor
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > state.transactionIds.length) {
        return sendWaMessage(
          chatId,
          `⚠️ Masukkan nomor antara 1–${state.transactionIds.length} atau *batal*.`,
        );
      }

      const selectedId = state.transactionIds[num - 1];

      // Tentukan aksi: hapus atau konfirmasi berdasarkan konteks
      // Cek apakah transaksi ini confirmed atau tidak
      const [tx] = await this.db
        .select({
          isConfirmed: transactions.isConfirmed,
          name: transactions.name,
        })
        .from(transactions)
        .where(eq(transactions.id, selectedId))
        .limit(1);

      if (!tx) {
        await this.valkey.del(pendingActionKey(chatId));
        return sendWaMessage(chatId, "Transaksi tidak ditemukan.");
      }

      if (!tx.isConfirmed) {
        // Mode: konfirmasi transaksi pending
        await this.db
          .update(transactions)
          .set({ isConfirmed: true, updatedAt: new Date() })
          .where(eq(transactions.id, selectedId));

        await this.valkey.del(pendingActionKey(chatId));
        return sendWaMessage(
          chatId,
          `✅ Transaksi *${tx.name}* berhasil dikonfirmasi.`,
        );
      } else {
        // Mode: pilih untuk dihapus - minta konfirmasi ulang
        const newState: PendingActionState = {
          action: "confirm_delete",
          transactionIds: [selectedId],
          description: tx.name,
        };
        await this.valkey.setex(
          pendingActionKey(chatId),
          PENDING_ACTION_TTL,
          JSON.stringify(newState),
        );
        return sendWaMessage(
          chatId,
          `🗑️ Yakin ingin hapus transaksi *${tx.name}*?\nBalas *ya* atau *tidak*.`,
        );
      }
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async getUserTimezone(userId: string): Promise<string> {
    const [user] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.timezone ?? "Asia/Jakarta";
  }
}
