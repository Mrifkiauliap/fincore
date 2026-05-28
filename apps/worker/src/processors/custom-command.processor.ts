import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import {
  getDb,
  paymentMethods,
  transactionCategories,
  transactionTagMappings,
  transactionTags,
  transactions,
  users,
} from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";

export interface CustomCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

@Injectable()
export class CustomCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.CUSTOM_COMMAND;
  private readonly db = getDb();
  private readonly prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  constructor() {
    super("worker:custom-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<CustomCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_CUSTOM_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    // 1. Ambil user
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    if (!user) {
      return this.sendReply(chatId, "Pengguna tidak ditemukan.");
    }

    const lower = commandText.toLowerCase().trim();
    const p = this.prefix;

    // ── /tambah ──────────────────────────────────────────────────────────────
    if (lower.startsWith(p + "tambah metode ")) {
      const name = commandText.slice((p + "tambah metode ").length).trim();
      return this.handleAddPaymentMethod(chatId, user.id, name);
    }

    if (lower.startsWith(p + "tambah kategori ")) {
      const rest = commandText.slice((p + "tambah kategori ").length).trim();
      return this.handleAddCategory(chatId, user.id, rest);
    }

    // ── /lihat ───────────────────────────────────────────────────────────────
    if (lower === p + "lihat metode" || lower.startsWith(p + "lihat metode ")) {
      return this.handleListPaymentMethods(chatId, user.id);
    }

    if (
      lower === p + "lihat kategori" ||
      lower.startsWith(p + "lihat kategori ")
    ) {
      const typeFilter = lower.startsWith(p + "lihat kategori ")
        ? lower.slice((p + "lihat kategori ").length).trim()
        : null;
      return this.handleListCategories(chatId, user.id, typeFilter);
    }

    // ── /cari ─────────────────────────────────────────────────────────────────
    if (lower.startsWith(p + "cari ")) {
      const query = commandText.slice((p + "cari ").length).trim();
      return this.handleSearch(chatId, user.id, query);
    }

    await this.sendReply(
      chatId,
      "❓ Contoh penggunaan:\n" +
        `• \`${p}tambah metode BCA Tabungan\`\n` +
        `• \`${p}tambah kategori Langganan Streaming expense\`\n` +
        `• \`${p}lihat metode\`\n` +
        `• \`${p}lihat kategori expense\`\n` +
        `• \`${p}cari bakso\`\n` +
        `• \`${p}cari #cheatday\``,
    );
  }

  // ─── CARI TRANSAKSI ────────────────────────────────────────────────────────

  private async handleSearch(chatId: string, userId: string, query: string) {
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
      // Cari transaksi berdasarkan tag
      const matchingTags = await this.db
        .select({ id: transactionTags.id })
        .from(transactionTags)
        .where(
          and(
            eq(transactionTags.userId, userId),
            ilike(transactionTags.name, `%${cleanQuery}%`),
          ),
        );

      if (matchingTags.length === 0) {
        return this.sendReply(
          chatId,
          `Tidak ada transaksi dengan tag *#${cleanQuery}*.`,
        );
      }

      const tagIds = matchingTags.map((t) => t.id);
      const mappings = await this.db
        .select({ transactionId: transactionTagMappings.transactionId })
        .from(transactionTagMappings)
        .where(inArray(transactionTagMappings.tagId, tagIds));

      const txIds = [...new Set(mappings.map((m) => m.transactionId))];
      if (txIds.length === 0) {
        return this.sendReply(
          chatId,
          `Tidak ada transaksi dengan tag *#${cleanQuery}*.`,
        );
      }

      results = await this.db
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
      // Cari berdasarkan nama transaksi
      results = await this.db
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
      return this.sendReply(
        chatId,
        `Tidak ada transaksi yang cocok dengan *"${query}"*.`,
      );
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
      const date = new Date(tx.transactionDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const cat = tx.categoryName ? ` · ${tx.categoryName}` : "";
      reply += `• *${tx.name}*\n`;
      reply += `  ${formatter.format(Number(tx.totalAmount))} · ${typeLabel(tx.type)}${cat}\n`;
      reply += `  ${date}\n\n`;
    }

    await this.sendReply(chatId, reply.trim());
  }

  // ─── HANDLERS ─────────────────────────────────────────────────────────────

  private async handleAddPaymentMethod(
    chatId: string,
    userId: string,
    rest: string,
  ) {
    const parts = rest.trim().split(/\s+/);
    const typeRaw = parts[parts.length - 1]?.toLowerCase() ?? "";

    const validTypesMap: Record<string, string> = {
      cash: "cash",
      tunai: "cash",
      ewallet: "e_wallet",
      e_wallet: "e_wallet",
      bank: "bank_transfer",
      transfer: "bank_transfer",
      kredit: "credit_card",
      credit: "credit_card",
      cc: "credit_card",
      debit: "debit_card",
      qris: "qris",
      lainnya: "other",
      other: "other",
    };

    let type = "other";
    let nameParts = parts;

    if (validTypesMap[typeRaw]) {
      type = validTypesMap[typeRaw];
      nameParts = parts.slice(0, -1);
    } else {
      // Heuristic detection ("Poor man's AI") based on name
      const full = rest.toLowerCase();
      if (
        /bca|bni|bri|mandiri|bsi|jago|jenius|bank|tabungan|rekening/.test(full)
      ) {
        type = "bank_transfer";
      } else if (/gopay|ovo|dana|shopeepay|spay|linkaja|wallet/.test(full)) {
        type = "e_wallet";
      } else if (/cash|tunai|dompet/.test(full)) {
        type = "cash";
      } else if (/kredit|cc|paylater/.test(full)) {
        type = "credit_card";
      } else if (/debit/.test(full)) {
        type = "debit_card";
      } else if (/qris/.test(full)) {
        type = "qris";
      }
    }

    const name = nameParts.join(" ").trim();
    if (!name || name.length < 2) {
      return this.sendReply(
        chatId,
        `⚠️ Nama terlalu pendek. Contoh: \`${this.prefix}tambah metode BCA Tabungan\` atau \`${this.prefix}tambah metode Uang Tunai cash\``,
      );
    }

    // Cek duplikat
    const [existing] = await this.db
      .select()
      .from(paymentMethods)
      .where(
        and(eq(paymentMethods.userId, userId), eq(paymentMethods.name, name)),
      )
      .limit(1);

    if (existing) {
      return this.sendReply(
        chatId,
        `⚠️ Metode pembayaran *${name}* sudah ada.`,
      );
    }

    let icon = "💳";
    if (type === "cash") icon = "💵";
    else if (type === "e_wallet") icon = "📱";
    else if (type === "bank_transfer") icon = "🏦";
    else if (type === "qris") icon = "📲";

    await this.db.insert(paymentMethods).values({
      userId,
      name,
      type: type as any, // casting to satisfy drizzle enum type
      icon,
      isActive: true,
    });

    await this.sendReply(
      chatId,
      `✅ Metode pembayaran *${name}* (${type.replace("_", " ")}) berhasil ditambahkan.`,
    );
  }

  private async handleAddCategory(
    chatId: string,
    userId: string,
    rest: string,
  ) {
    // Format: "Nama Kategori [expense|income]"
    const parts = rest.trim().split(/\s+/);
    const typeRaw = parts[parts.length - 1]?.toLowerCase();
    const validTypes = ["expense", "income", "transfer"];

    let type: "expense" | "income" | "transfer";
    let nameParts: string[];

    if (validTypes.includes(typeRaw)) {
      type = typeRaw as "expense" | "income" | "transfer";
      nameParts = parts.slice(0, -1);
    } else {
      type = "expense"; // default
      nameParts = parts;
    }

    const name = nameParts.join(" ").trim();
    if (!name || name.length < 2) {
      return this.sendReply(
        chatId,
        `⚠️ Format salah. Contoh: \`${this.prefix}tambah kategori Langganan Streaming expense\``,
      );
    }

    // Generate slug dari nama
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "-");

    // Cek duplikat
    const [existing] = await this.db
      .select()
      .from(transactionCategories)
      .where(
        and(
          eq(transactionCategories.userId, userId),
          eq(transactionCategories.slug, slug),
          eq(transactionCategories.type, type),
        ),
      )
      .limit(1);

    if (existing) {
      return this.sendReply(
        chatId,
        `⚠️ Kategori *${name}* untuk tipe *${type}* sudah ada.`,
      );
    }

    await this.db.insert(transactionCategories).values({
      userId,
      name,
      slug,
      type,
      icon: type === "expense" ? "💸" : type === "income" ? "💰" : "🔄",
      isDefault: false,
      isActive: true,
      sortOrder: 99,
    });

    const typeLabel =
      type === "expense"
        ? "pengeluaran"
        : type === "income"
          ? "pemasukan"
          : "transfer";

    await this.sendReply(
      chatId,
      `✅ Kategori *${name}* (${typeLabel}) berhasil ditambahkan.`,
    );
  }

  private async handleListPaymentMethods(chatId: string, userId: string) {
    const methods = await this.db
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
      return this.sendReply(
        chatId,
        "ℹ️ Belum ada metode pembayaran tersimpan.",
      );
    }

    const globals = [];
    const custom = [];
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

    await this.sendReply(chatId, reply.trim());
  }

  private async handleListCategories(
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

    const cats = await this.db
      .select()
      .from(transactionCategories)
      .where(whereClause)
      .orderBy(
        asc(transactionCategories.type),
        asc(transactionCategories.sortOrder),
      );

    if (cats.length === 0) {
      return this.sendReply(chatId, "ℹ️ Belum ada kategori tersimpan.");
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

    await this.sendReply(chatId, reply.trim());
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
