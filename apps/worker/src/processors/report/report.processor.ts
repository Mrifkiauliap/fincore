import { findUserByPhone } from "@/lib/user-lookup";
import { BaseProcessor } from "@/processors/base.processor";
import { SumopodProvider } from "@fincore/ai";
import getConfig from "@fincore/config";
import { getDb, transactionCategories, transactions } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaImage, sendWaMessage } from "@fincore/queue";
import { QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import dayjs from "dayjs";
import "dayjs/locale/id";
import isoWeek from "dayjs/plugin/isoWeek";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, between, eq, sql } from "drizzle-orm";
import {
  buildBalanceReport,
  buildByCategoryReport,
  buildByMerchantReport,
  buildByPaymentMethodReport,
  buildTopExpensesReport,
  buildTopIncomeReport,
} from "./report-builders";
import { buildChartUrl } from "./report-chart";
import { buildSummaryReport } from "./report-summary";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.locale("id");

const logger = createLogger("processor:report");

interface ReportJobData {
  from: string;
  senderPhone: string;
  query: string;
  type: "query";
  rawMessageId: string | null;
}

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

function getDateRange(
  parsed: ParsedQuery,
  userTimezone: string = "Asia/Jakarta",
): { from: Date; to: Date; label: string } {
  const now = dayjs().tz(userTimezone);
  const startOf = (d: dayjs.Dayjs) => d.startOf("day").toDate();
  const endOf = (d: dayjs.Dayjs) => d.endOf("day").toDate();

  switch (parsed.periode) {
    case "today":
      return { from: startOf(now), to: endOf(now), label: "hari ini" };
    case "yesterday": {
      const y = now.subtract(1, "day");
      return { from: startOf(y), to: endOf(y), label: "kemarin" };
    }
    case "this_week": {
      const mon = now.startOf("isoWeek");
      return { from: startOf(mon), to: endOf(now), label: "minggu ini" };
    }
    case "last_week": {
      const lastWeek = now.subtract(1, "week");
      const mon = lastWeek.startOf("isoWeek");
      const sun = lastWeek.endOf("isoWeek");
      return { from: startOf(mon), to: endOf(sun), label: "minggu lalu" };
    }
    case "this_month": {
      const from = now.startOf("month");
      return { from: startOf(from), to: endOf(now), label: "bulan ini" };
    }
    case "last_month": {
      const lastMonth = now.subtract(1, "month");
      const from = lastMonth.startOf("month");
      const to = lastMonth.endOf("month");
      return { from: startOf(from), to: endOf(to), label: "bulan lalu" };
    }
    case "this_year": {
      const from = now.startOf("year");
      return { from: startOf(from), to: endOf(now), label: "tahun ini" };
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
        MONTHS[parsed.month_name?.toLowerCase() ?? ""] ?? now.month();
      let year = now.year();
      if (mIdx > now.month()) year -= 1;

      const targetMonth = now.year(year).month(mIdx);
      const from = targetMonth.startOf("month");
      const to = targetMonth.endOf("month");

      const label = parsed.month_name
        ? parsed.month_name.charAt(0).toUpperCase() + parsed.month_name.slice(1)
        : "bulan ini";
      return { from: startOf(from), to: endOf(to), label };
    }
    default: {
      const from = now.startOf("month");
      return { from: startOf(from), to: endOf(now), label: "bulan ini" };
    }
  }
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

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(
        chatId,
        "Akun kamu belum terdaftar. Kirimkan pesan transaksi dulu ya.",
      );
      return;
    }

    const parsed = await this.parseQuery(query);
    logger.info({ parsed, query }, "Query parsed");

    const {
      from: dateFrom,
      to: dateTo,
      label: periodLabel,
    } = getDateRange(parsed, "Asia/Jakarta");

    const baseFilters = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
      between(transactions.transactionDate, dateFrom, dateTo),
    ];

    if (parsed.transaction_type) {
      baseFilters.push(eq(transactions.type, parsed.transaction_type as any));
    }

    let reply = await this.buildReport(
      db,
      parsed,
      baseFilters,
      periodLabel,
      user.id,
      dateFrom,
      dateTo,
      "Asia/Jakarta",
    );

    // ─── Generate AI Insight ──────────────────────────────────────────────────
    try {
      const ai = new SumopodProvider();
      const insight = await ai.generateSummary(reply);
      if (insight) {
        reply = `${reply}\n\n💡 *AI Insight:*\n_${insight}_`;
      }
    } catch (err) {
      logger.warn(
        { err },
        "Failed to generate AI insight, continuing with raw report",
      );
    }

    await sendWaMessage(chatId, reply);

    // ─── Generate Pie Chart (summary / by_category) ───────────────────────────
    if (
      parsed.report_type === "summary" ||
      parsed.report_type === "by_category"
    ) {
      try {
        const chartData = await db
          .select({
            category: transactionCategories.name,
            total: sql<string>`SUM(${transactions.totalAmount})`,
          })
          .from(transactions)
          .leftJoin(
            transactionCategories,
            eq(transactions.categoryId, transactionCategories.id),
          )
          .where(
            and(
              eq(transactions.userId, user.id),
              eq(transactions.isDeleted, false),
              eq(transactions.type, "expense"),
              between(transactions.transactionDate, dateFrom, dateTo),
            ),
          )
          .groupBy(transactionCategories.name)
          .orderBy(sql`SUM(${transactions.totalAmount}) DESC`)
          .limit(8);

        if (chartData.length > 0) {
          const chartUrl = buildChartUrl(
            chartData
              .filter((r) => r.category)
              .map((r) => ({
                label: r.category!,
                value: Math.round(parseFloat(r.total ?? "0")),
              })),
            `Pengeluaran ${periodLabel}`,
          );

          await sendWaImage(chatId, chartUrl);
        }
      } catch (err) {
        logger.warn({ err }, "Failed to generate chart (non-fatal)");
      }
    }
  }

  private async buildReport(
    db: ReturnType<typeof getDb>,
    parsed: ParsedQuery,
    baseFilters: any[],
    periodLabel: string,
    userId: string,
    dateFrom: Date,
    dateTo: Date,
    userTimezone: string,
  ): Promise<string> {
    switch (parsed.report_type) {
      case "balance":
        return buildBalanceReport(userId);
      case "top_expenses":
        return buildTopExpensesReport(baseFilters, periodLabel, userTimezone);
      case "top_income":
        return buildTopIncomeReport(baseFilters, periodLabel, userTimezone);
      case "by_category":
        return buildByCategoryReport(
          userId,
          baseFilters,
          periodLabel,
          parsed.transaction_type,
        );
      case "by_payment_method":
        return buildByPaymentMethodReport(
          userId,
          baseFilters,
          parsed,
          periodLabel,
        );
      case "by_merchant":
        return buildByMerchantReport(baseFilters, periodLabel);
      case "summary":
      default:
        return buildSummaryReport(
          userId,
          parsed,
          periodLabel,
          dateFrom,
          dateTo,
          userTimezone,
        );
    }
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
      logger.warn({ err }, "Query parsing failed, using defaults");
      return defaults;
    }
  }
}
