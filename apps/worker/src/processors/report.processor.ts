import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import {
  getDb,
  paymentMethods,
  transactionCategories,
  transactions,
  users,
} from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import { and, between, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

interface ReportJobData {
  from: string; // WhatsApp chatId
  senderPhone: string;
  query: string; // natural language query dari user
  type: "query";
  rawMessageId: string | null;
}

// ─── AI Query Parser ──────────────────────────────────────────────────────────
const QUERY_PARSER_PROMPT = `
Kamu adalah parser query laporan keuangan untuk aplikasi FinCore.
Tugasmu: Ubah query natural language user menjadi filter terstruktur JSON.

Aturan periode:
- "bulan ini" > periode: "this_month"
- "bulan lalu" > periode: "last_month"
- "minggu ini" > periode: "this_week"
- "minggu lalu" > periode: "last_week"
- "hari ini" > periode: "today"
- "kemarin" > periode: "yesterday"
- "tahun ini" > periode: "this_year"
- Nama bulan (Januari–Desember) > periode: "month_name", month_name: "januari"
- Jika tidak disebutkan > periode: "this_month"

Aturan transaction_type:
- "pengeluaran", "keluar", "belanja", "bayar" > "expense"
- "pemasukan", "pendapatan", "masuk", "gaji", "terima" > "income"
- "transfer" > "transfer"
- "saldo", "total", "semua", "rekap", "ringkasan" > null (semua tipe)

Aturan report_type:
- "saldo", "total saldo", "dompet" > "balance"
- "ringkasan", "rangkum", "rekap", "laporan" > "summary"
- "pengeluaran terbesar", "terbesar", "paling banyak" > "top_expenses"
- "pemasukan terbesar", "income terbesar", "pendapatan terbesar" > "top_income"
- "per kategori", "kategori" > "by_category"
- "per metode", "metode pembayaran", "gopay", "ovo", "dana" > "by_payment_method"
- "merchant", "toko", "tempat" > "by_merchant"
- Default: "summary"

Return HANYA JSON:
{
  "periode": "today|yesterday|this_week|last_week|this_month|last_month|this_year|month_name",
  "month_name": "nama bulan huruf kecil jika periode = month_name, selainnya null",
  "transaction_type": "expense|income|transfer|null",
  "report_type": "summary|balance|top_expenses|top_income|by_category|by_payment_method|by_merchant",
  "payment_method_filter": "nama payment method jika query menyebut spesifik, null jika tidak",
  "merchant_filter": "nama merchant jika query menyebut spesifik, null jika tidak",
  "category_filter": "nama kategori jika query menyebut spesifik, null jika tidak"
}
`.trim();

interface ParsedQuery {
  periode: string;
  month_name: string | null;
  transaction_type: "expense" | "income" | "transfer" | null;
  report_type:
    | "summary"
    | "balance"
    | "top_expenses"
    | "top_income"
    | "by_category"
    | "by_payment_method"
    | "by_merchant";
  payment_method_filter: string | null;
  merchant_filter: string | null;
  category_filter: string | null;
}

// ─── Date range helpers ───────────────────────────────────────────────────────
function getDateRange(parsed: ParsedQuery): {
  from: Date;
  to: Date;
  label: string;
} {
  const now = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (parsed.periode) {
    case "today":
      return { from: startOf(now), to: endOf(now), label: "hari ini" };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOf(y), to: endOf(y), label: "kemarin" };
    }
    case "this_week": {
      const day = now.getDay(); // 0 = Sunday
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((day + 6) % 7)); // Monday
      return { from: startOf(mon), to: endOf(now), label: "minggu ini" };
    }
    case "last_week": {
      const day = now.getDay();
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - ((day + 6) % 7));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return {
        from: startOf(lastMonday),
        to: endOf(lastSunday),
        label: "minggu lalu",
      };
    }
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: endOf(now), label: "bulan ini" };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
      return { from, to, label: "bulan lalu" };
    }
    case "this_year": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to: endOf(now), label: "tahun ini" };
    }
    case "month_name": {
      const MONTHS: Record<string, number> = {
        januari: 0,
        februari: 1,
        maret: 2,
        april: 3,
        mei: 4,
        juni: 5,
        juli: 6,
        agustus: 7,
        september: 8,
        oktober: 9,
        november: 10,
        desember: 11,
      };
      const mIdx =
        MONTHS[parsed.month_name?.toLowerCase() ?? ""] ?? now.getMonth();
      const year =
        mIdx > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      const from = new Date(year, mIdx, 1);
      const to = new Date(year, mIdx + 1, 0, 23, 59, 59, 999);
      const label = parsed.month_name
        ? parsed.month_name.charAt(0).toUpperCase() + parsed.month_name.slice(1)
        : "bulan ini";
      return { from, to, label };
    }
    default: {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: endOf(now), label: "bulan ini" };
    }
  }
}

// ─── Number formatter ─────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

@Injectable()
export class ReportProcessor extends BaseProcessor {
  readonly queueName = QueueName.REPORT_GENERATION;

  constructor() {
    super("processor:report");
  }

  async process(job: Job<ReportJobData>): Promise<void> {
    const { from: chatId, senderPhone, query } = job.data;
    const db = getDb();

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, senderPhone))
      .limit(1);

    if (!user) {
      await this.sendReply(
        chatId,
        "Akun kamu belum terdaftar. Kirimkan pesan transaksi dulu ya.",
      );
      return;
    }

    const parsed = await this.parseQuery(query);
    this.logger.info({ parsed, query }, "Query parsed");

    const {
      from: dateFrom,
      to: dateTo,
      label: periodLabel,
    } = getDateRange(parsed);

    const baseFilters = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
      between(transactions.transactionDate, dateFrom, dateTo),
    ];

    if (parsed.transaction_type) {
      baseFilters.push(eq(transactions.type, parsed.transaction_type));
    }

    const reply = await this.buildReport(
      db,
      parsed,
      baseFilters,
      periodLabel,
      user.id,
      dateFrom,
      dateTo,
    );

    await this.sendReply(chatId, reply);
  }

  // ─── Report builders ────────────────────────────────────────────────────────
  private async buildReport(
    db: ReturnType<typeof getDb>,
    parsed: ParsedQuery,
    baseFilters: any[],
    periodLabel: string,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<string> {
    switch (parsed.report_type) {
      case "balance":
        return this.buildBalanceReport(db, userId, periodLabel);
      case "top_expenses":
        return this.buildTopExpensesReport(db, baseFilters, periodLabel);
      case "top_income":
        return this.buildTopIncomeReport(db, baseFilters, periodLabel);
      case "by_category":
        return this.buildByCategoryReport(
          db,
          userId,
          baseFilters,
          periodLabel,
          parsed.transaction_type,
        );
      case "by_payment_method":
        return this.buildByPaymentMethodReport(
          db,
          userId,
          baseFilters,
          parsed,
          periodLabel,
        );
      case "by_merchant":
        return this.buildByMerchantReport(db, baseFilters, periodLabel);
      case "summary":
      default:
        return this.buildSummaryReport(
          db,
          userId,
          parsed,
          baseFilters,
          periodLabel,
          dateFrom,
          dateTo,
        );
    }
  }

  /** Ringkasan: total income, expense, selisih */
  private async buildSummaryReport(
    db: ReturnType<typeof getDb>,
    userId: string,
    parsed: ParsedQuery,
    baseFilters: any[],
    periodLabel: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<string> {
    // Get totals per type
    const rows = await db
      .select({
        type: transactions.type,
        total: sql<string>`SUM(${transactions.totalAmount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          between(transactions.transactionDate, dateFrom, dateTo),
        ),
      )
      .groupBy(transactions.type);

    const income = rows.find((r) => r.type === "income");
    const expense = rows.find((r) => r.type === "expense");
    const transfer = rows.find((r) => r.type === "transfer");

    const totalIncome = parseFloat(income?.total ?? "0");
    const totalExpense = parseFloat(expense?.total ?? "0");
    const totalTransfer = parseFloat(transfer?.total ?? "0");
    const balance = totalIncome - totalExpense;

    const typeFilter = parsed.transaction_type;

    const lines: string[] = [`*Laporan ${periodLabel}*`, ""];

    if (!typeFilter || typeFilter === "income") {
      lines.push(`Pemasukan: ${fmt(totalIncome)} (${income?.count ?? 0}x)`);
    }
    if (!typeFilter || typeFilter === "expense") {
      lines.push(`Pengeluaran: ${fmt(totalExpense)} (${expense?.count ?? 0}x)`);
    }
    if (!typeFilter || typeFilter === "transfer") {
      lines.push(`Transfer: ${fmt(totalTransfer)} (${transfer?.count ?? 0}x)`);
    }
    if (!typeFilter) {
      lines.push("", `Selisih: ${balance >= 0 ? "+" : ""}${fmt(balance)}`);
    }

    // Top 3 transactions for context
    const recent = await db
      .select({
        type: transactions.type,
        amount: transactions.totalAmount,
        merchant: transactions.merchant,
        notes: transactions.notes,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.isDeleted, false),
          between(transactions.transactionDate, dateFrom, dateTo),
          ...(typeFilter ? [eq(transactions.type, typeFilter)] : []),
        ),
      )
      .orderBy(desc(transactions.transactionDate))
      .limit(3);

    if (recent.length > 0) {
      lines.push("", "Transaksi terakhir:");
      for (const t of recent) {
        const label = t.merchant ?? t.notes ?? t.type;
        const dateStr = new Date(t.transactionDate).toLocaleDateString(
          "id-ID",
          { day: "numeric", month: "short" },
        );
        lines.push(`- ${dateStr}: ${label} ${fmt(parseFloat(t.amount))}`);
      }
    }

    return lines.join("\n");
  }

  /** Saldo: total pemasukan - total pengeluaran */
  private async buildBalanceReport(
    db: ReturnType<typeof getDb>,
    userId: string,
    periodLabel: string,
  ): Promise<string> {
    const rows = await db
      .select({
        type: transactions.type,
        total: sql<string>`SUM(${transactions.totalAmount})`,
      })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.isDeleted, false)),
      )
      .groupBy(transactions.type);

    const income = parseFloat(
      rows.find((r) => r.type === "income")?.total ?? "0",
    );
    const expense = parseFloat(
      rows.find((r) => r.type === "expense")?.total ?? "0",
    );
    const balance = income - expense;

    return [
      "*Estimasi Saldo Bersih*",
      "",
      `Total pemasukan: ${fmt(income)}`,
      `Total pengeluaran: ${fmt(expense)}`,
      "",
      `Estimasi saldo: ${balance >= 0 ? "+" : ""}${fmt(balance)}`,
      "",
      "_Catatan: saldo dihitung dari seluruh transaksi tercatat, bukan saldo rekening asli._",
    ].join("\n");
  }

  /** Top pengeluaran terbesar */
  private async buildTopExpensesReport(
    db: ReturnType<typeof getDb>,
    baseFilters: any[],
    periodLabel: string,
  ): Promise<string> {
    const rows = await db
      .select({
        amount: transactions.totalAmount,
        merchant: transactions.merchant,
        notes: transactions.notes,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .where(and(...baseFilters, eq(transactions.type, "expense")))
      .orderBy(desc(transactions.totalAmount))
      .limit(5);

    if (rows.length === 0) {
      return `Tidak ada data pengeluaran untuk ${periodLabel}.`;
    }

    const lines = [`*Pengeluaran Terbesar - ${periodLabel}*`, ""];
    rows.forEach((r, i) => {
      const label = r.merchant ?? r.notes ?? "Tanpa keterangan";
      const dateStr = new Date(r.transactionDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      });
      lines.push(
        `${i + 1}. ${label} — ${fmt(parseFloat(r.amount))} (${dateStr})`,
      );
    });

    return lines.join("\n");
  }

  /** Top pemasukan terbesar */
  private async buildTopIncomeReport(
    db: ReturnType<typeof getDb>,
    baseFilters: any[],
    periodLabel: string,
  ): Promise<string> {
    const rows = await db
      .select({
        amount: transactions.totalAmount,
        merchant: transactions.merchant,
        notes: transactions.notes,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .where(and(...baseFilters, eq(transactions.type, "income")))
      .orderBy(desc(transactions.totalAmount))
      .limit(5);

    if (rows.length === 0) {
      return `Tidak ada data pemasukan untuk ${periodLabel}.`;
    }

    const lines = [`*Pemasukan Terbesar - ${periodLabel}*`, ""];
    rows.forEach((r, i) => {
      const label = r.merchant ?? r.notes ?? "Tanpa keterangan";
      const dateStr = new Date(r.transactionDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      });
      lines.push(
        `${i + 1}. ${label} — ${fmt(parseFloat(r.amount))} (${dateStr})`,
      );
    });

    return lines.join("\n");
  }

  /** Pengeluaran per kategori */
  private async buildByCategoryReport(
    db: ReturnType<typeof getDb>,
    userId: string,
    baseFilters: any[],
    periodLabel: string,
    typeFilter: string | null,
  ): Promise<string> {
    const rows = await db
      .select({
        categoryName: transactionCategories.name,
        total: sql<string>`SUM(${transactions.totalAmount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .leftJoin(
        transactionCategories,
        eq(transactions.categoryId, transactionCategories.id),
      )
      .where(
        and(
          ...baseFilters,
          ...(typeFilter ? [eq(transactions.type, typeFilter as any)] : []),
        ),
      )
      .groupBy(transactionCategories.name)
      .orderBy(desc(sql`SUM(${transactions.totalAmount})`))
      .limit(8);

    if (rows.length === 0) {
      return `Tidak ada data untuk ${periodLabel}.`;
    }

    const typeLabel =
      typeFilter === "income"
        ? "Pemasukan"
        : typeFilter === "transfer"
          ? "Transfer"
          : "Pengeluaran";
    const lines = [`*${typeLabel} per Kategori - ${periodLabel}*`, ""];

    for (const r of rows) {
      const name = r.categoryName ?? "Lainnya";
      lines.push(`${name}: ${fmt(parseFloat(r.total))} (${r.count}x)`);
    }

    return lines.join("\n");
  }

  /** Pengeluaran per metode pembayaran */
  private async buildByPaymentMethodReport(
    db: ReturnType<typeof getDb>,
    userId: string,
    baseFilters: any[],
    parsed: ParsedQuery,
    periodLabel: string,
  ): Promise<string> {
    const extraFilters: any[] = [];
    if (parsed.payment_method_filter) {
      const pmRows = await db
        .select({ id: paymentMethods.id, name: paymentMethods.name })
        .from(paymentMethods)
        .where(
          and(
            or(
              isNull(paymentMethods.userId),
              eq(paymentMethods.userId, userId),
            ),
            ilike(paymentMethods.name, `%${parsed.payment_method_filter}%`),
          ),
        )
        .limit(1);

      if (pmRows.length > 0) {
        extraFilters.push(eq(transactions.paymentMethodId, pmRows[0].id));
      }
    }

    const rows = await db
      .select({
        pmName: paymentMethods.name,
        total: sql<string>`SUM(${transactions.totalAmount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .leftJoin(
        paymentMethods,
        eq(transactions.paymentMethodId, paymentMethods.id),
      )
      .where(and(...baseFilters, ...extraFilters))
      .groupBy(paymentMethods.name)
      .orderBy(desc(sql`SUM(${transactions.totalAmount})`))
      .limit(8);

    if (rows.length === 0) {
      return `Tidak ada data untuk ${periodLabel}.`;
    }

    const lines = [`*Transaksi per Metode Pembayaran - ${periodLabel}*`, ""];
    for (const r of rows) {
      lines.push(
        `${r.pmName ?? "Tidak diketahui"}: ${fmt(parseFloat(r.total))} (${r.count}x)`,
      );
    }

    return lines.join("\n");
  }

  /** Pengeluaran per merchant */
  private async buildByMerchantReport(
    db: ReturnType<typeof getDb>,
    baseFilters: any[],
    periodLabel: string,
  ): Promise<string> {
    const rows = await db
      .select({
        merchant: transactions.merchant,
        total: sql<string>`SUM(${transactions.totalAmount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(...baseFilters))
      .groupBy(transactions.merchant)
      .orderBy(desc(sql`SUM(${transactions.totalAmount})`))
      .limit(8);

    const filled = rows.filter((r) => r.merchant);
    if (filled.length === 0) {
      return `Tidak ada data merchant untuk ${periodLabel}.`;
    }

    const lines = [`*Transaksi per Merchant - ${periodLabel}*`, ""];
    for (const r of filled) {
      lines.push(`${r.merchant}: ${fmt(parseFloat(r.total))} (${r.count}x)`);
    }

    return lines.join("\n");
  }

  private async parseQuery(query: string): Promise<ParsedQuery> {
    const defaults: ParsedQuery = {
      periode: "this_month",
      month_name: null,
      transaction_type: null,
      report_type: "summary",
      payment_method_filter: null,
      merchant_filter: null,
      category_filter: null,
    };

    try {
      const res = await axios.post(
        `${getConfig("SUMOPOD_BASE_URL")}/chat/completions`,
        {
          model: "gemini/gemini-2.0-flash-lite",
          messages: [
            { role: "system", content: QUERY_PARSER_PROMPT },
            { role: "user", content: query },
          ],
          temperature: 0,
          max_tokens: 200,
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${getConfig("SUMOPOD_API_KEY")}`,
            "Content-Type": "application/json",
          },
          timeout: 8_000,
        },
      );

      const raw = JSON.parse(res.data.choices[0].message.content);
      return { ...defaults, ...raw };
    } catch (err) {
      this.logger.warn({ err }, "Query parsing failed, using defaults");
      return defaults;
    }
  }

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
