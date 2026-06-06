import { fmtCurrency } from "@/lib/date-utils";
import {
  getDb,
  paymentMethods,
  transactionCategories,
  transactions,
} from "@fincore/db";
import dayjs from "dayjs";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

type ParsedQuery = {
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
};

/** Saldo: total pemasukan - total pengeluaran (all-time) */
export async function buildBalanceReport(userId: string): Promise<string> {
  const db = getDb();

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
    `Total pemasukan: ${fmtCurrency(income)}`,
    `Total pengeluaran: ${fmtCurrency(expense)}`,
    "",
    `Estimasi saldo: ${balance >= 0 ? "+" : ""}${fmtCurrency(balance)}`,
    "",
    "_Catatan: saldo dihitung dari seluruh transaksi tercatat, bukan saldo rekening asli._",
  ].join("\n");
}

/** Top pengeluaran terbesar */
export async function buildTopExpensesReport(
  baseFilters: any[],
  periodLabel: string,
  userTimezone: string = "Asia/Jakarta",
): Promise<string> {
  const db = getDb();

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
    const dateStr = dayjs(r.transactionDate).tz(userTimezone).format("D MMM");
    lines.push(
      `${i + 1}. ${label} - ${fmtCurrency(parseFloat(r.amount))} (${dateStr})`,
    );
  });

  return lines.join("\n");
}

/** Top pemasukan terbesar */
export async function buildTopIncomeReport(
  baseFilters: any[],
  periodLabel: string,
  userTimezone: string = "Asia/Jakarta",
): Promise<string> {
  const db = getDb();

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
    const dateStr = dayjs(r.transactionDate).tz(userTimezone).format("D MMM");
    lines.push(
      `${i + 1}. ${label} - ${fmtCurrency(parseFloat(r.amount))} (${dateStr})`,
    );
  });

  return lines.join("\n");
}

/** Pengeluaran per kategori */
export async function buildByCategoryReport(
  userId: string,
  baseFilters: any[],
  periodLabel: string,
  typeFilter: string | null,
): Promise<string> {
  const db = getDb();

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
        ...(typeFilter
          ? [
              eq(
                transactions.type,
                typeFilter as "expense" | "income" | "transfer",
              ),
            ]
          : []),
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
    lines.push(`${name}: ${fmtCurrency(parseFloat(r.total))} (${r.count}x)`);
  }

  return lines.join("\n");
}

/** Pengeluaran per metode pembayaran */
export async function buildByPaymentMethodReport(
  userId: string,
  baseFilters: any[],
  parsed: ParsedQuery,
  periodLabel: string,
): Promise<string> {
  const db = getDb();

  const extraFilters: any[] = [];
  if (parsed.payment_method_filter) {
    const pmRows = await db
      .select({ id: paymentMethods.id, name: paymentMethods.name })
      .from(paymentMethods)
      .where(
        and(
          or(isNull(paymentMethods.userId), eq(paymentMethods.userId, userId)),
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
      `${r.pmName ?? "Tidak diketahui"}: ${fmtCurrency(parseFloat(r.total))} (${r.count}x)`,
    );
  }

  return lines.join("\n");
}

/** Pengeluaran per merchant */
export async function buildByMerchantReport(
  baseFilters: any[],
  periodLabel: string,
): Promise<string> {
  const db = getDb();

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
    lines.push(
      `${r.merchant}: ${fmtCurrency(parseFloat(r.total))} (${r.count}x)`,
    );
  }

  return lines.join("\n");
}
