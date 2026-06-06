import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getDb, recurringBills, transactions } from "@fincore/db";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;

    const range = searchParams.get("range") || "30d";
    const rangeDays: Record<string, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
      "365d": 365,
    };
    const days = rangeDays[range] || 30;
    const rangeStart = dayjs()
      .tz("Asia/Jakarta")
      .subtract(days, "day")
      .startOf("day")
      .toDate();

    const baseConditions = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
      eq(transactions.isConfirmed, true),
    ];

    const rangeConditions = [
      ...baseConditions,
      gte(transactions.transactionDate, rangeStart),
    ];

    // === Income/Expense/Fee summary ===
    const [ratio] = await db
      .select({
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalFee: sql<number>`COALESCE(SUM(${transactions.fee}), 0)`,
      })
      .from(transactions)
      .where(and(...rangeConditions));

    // === Spending Velocity (daily average spending per week) ===
    const dailySpending = await db
      .select({
        day: sql<string>`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM-DD')`,
        total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(and(...rangeConditions, eq(transactions.type, "expense")))
      .groupBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM-DD')`);

    // === Top spending categories with percentage ===
    const allRangeExpense = dailySpending.reduce((s, d) => s + d.total, 0);

    const categoryAnalytics = await db
      .select({
        name: sql<string>`COALESCE(tc.name, 'Tanpa Kategori')`,
        icon: sql<string>`tc.icon`,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(*)::int`,
        avgAmount: sql<number>`ROUND(COALESCE(AVG(${transactions.amount}), 0), 0)`,
      })
      .from(transactions)
      .leftJoin(
        sql`transaction_categories tc`,
        sql`${transactions.categoryId} = tc.id`,
      )
      .where(and(...rangeConditions, eq(transactions.type, "expense")))
      .groupBy(sql`tc.name`, sql`tc.icon`)
      .orderBy(sql`COALESCE(SUM(${transactions.amount}), 0) DESC`)
      .limit(10);

    // === Weekly trend (last 4 weeks) ===
    const fourWeeksAgo = dayjs()
      .tz("Asia/Jakarta")
      .subtract(4, "week")
      .startOf("week")
      .toDate();
    const weeklyTrend = await db
      .select({
        week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${transactions.transactionDate}), 'YYYY-MM-DD')`,
        expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .where(
        and(...baseConditions, gte(transactions.transactionDate, fourWeeksAgo)),
      )
      .groupBy(sql`DATE_TRUNC('week', ${transactions.transactionDate})`)
      .orderBy(sql`DATE_TRUNC('week', ${transactions.transactionDate})`);

    // === Largest transactions ===
    const largestTransactions = await db.query.transactions.findMany({
      where: and(...rangeConditions),
      with: { category: true, paymentMethod: true },
      orderBy: (tx: any, { desc }: any) => desc(tx.amount),
      limit: 5,
    });

    // === Spending pattern: most active day of week ===
    const dayOfWeekSpending = await db
      .select({
        dow: sql<string>`TO_CHAR(${transactions.transactionDate}, 'Day')`,
        dowNum: sql<number>`EXTRACT(DOW FROM ${transactions.transactionDate})`,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          ...baseConditions,
          eq(transactions.type, "expense"),
          gte(
            transactions.transactionDate,
            dayjs().tz("Asia/Jakarta").subtract(90, "day").toDate(),
          ),
        ),
      )
      .groupBy(
        sql`TO_CHAR(${transactions.transactionDate}, 'Day')`,
        sql`EXTRACT(DOW FROM ${transactions.transactionDate})`,
      )
      .orderBy(sql`EXTRACT(DOW FROM ${transactions.transactionDate})`);

    // === Burn Rate: avg monthly expense (last 3 months) ===
    const threeMonthsAgo = dayjs()
      .tz("Asia/Jakarta")
      .subtract(3, "month")
      .startOf("month")
      .toDate();

    const monthlyExpenses = await db
      .select({
        month: sql<string>`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          ...baseConditions,
          eq(transactions.type, "expense"),
          gte(transactions.transactionDate, threeMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`);

    const burnRate =
      monthlyExpenses.length > 0
        ? monthlyExpenses.reduce((s, m) => s + Number(m.total), 0) /
          monthlyExpenses.length
        : 0;

    // === Bill-to-Income Ratio: total active bills / avg monthly income ===
    const activeBills = await db
      .select({
        total: sql<number>`COALESCE(SUM(${recurringBills.amount}), 0)`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(recurringBills)
      .where(
        and(
          eq(recurringBills.userId, user.id),
          eq(recurringBills.isActive, true),
        ),
      );

    const totalMonthlyBills = Number(activeBills[0]?.total ?? 0);
    const billCount = Number(activeBills[0]?.count ?? 0);

    const avgMonthlyIncome =
      days > 0 && ratio ? (ratio.totalIncome / days) * 30 : 0;

    const billToIncomeRatio =
      avgMonthlyIncome > 0 ? (totalMonthlyBills / avgMonthlyIncome) * 100 : 0;

    // === AI-generated insights ===
    const insights: string[] = [];
    const totalFee = ratio?.totalFee ?? 0;

    if (ratio) {
      const netBalance = ratio.totalIncome - ratio.totalExpense - totalFee;
      const savingsRate =
        ratio.totalIncome > 0 ? (netBalance / ratio.totalIncome) * 100 : 0;
      if (savingsRate > 50) {
        insights.push(
          `💪 Tabungan kamu sangat sehat! ${savingsRate.toFixed(0)}% dari pemasukan berhasil disimpan dalam ${days} hari terakhir.`,
        );
      } else if (savingsRate > 20) {
        insights.push(
          `👍 Kamu menyimpan ${savingsRate.toFixed(0)}% pemasukan. Pertimbangkan untuk investasi dari dana lebih ini.`,
        );
      } else if (savingsRate > 0) {
        insights.push(
          `⚠️ Hanya ${savingsRate.toFixed(0)}% pemasukan yang tersisa. Coba evaluasi pengeluaran tidak penting.`,
        );
      } else if (ratio.totalExpense > 0) {
        insights.push(
          `🔴 Pengeluaran melebihi pemasukan sebesar ${formatCurrency(Math.abs(netBalance))} dalam ${days} hari terakhir. Segera kurangi pengeluaran!`,
        );
      }
    }

    // Burn rate insight
    if (burnRate > 0) {
      const emergency3 = burnRate * 3;
      const emergency6 = burnRate * 6;
      insights.push(
        `🔥 Rata-rata pengeluaran bulanan: ${formatCurrency(burnRate)}. Target dana darurat: ${formatCurrency(emergency3)} – ${formatCurrency(emergency6)} (3–6 bulan pengeluaran).`,
      );
    }

    // Bill-to-income insight
    if (billCount > 0 && avgMonthlyIncome > 0) {
      const emoji =
        billToIncomeRatio > 50 ? "🔴" : billToIncomeRatio > 30 ? "⚠️" : "✅";
      insights.push(
        `${emoji} ${billCount} tagihan aktif menghabiskan ${billToIncomeRatio.toFixed(0)}% dari estimasi pemasukan bulanan (${formatCurrency(totalMonthlyBills)}/bln). ${billToIncomeRatio > 50 ? "Ini terlalu tinggi, kurangi pengeluaran tetap!" : billToIncomeRatio > 30 ? "Masih wajar, tapi tetap waspada." : "Rasio tagihan sangat sehat!"}`,
      );
    }

    // Top category insight
    if (categoryAnalytics.length > 0) {
      const topCat = categoryAnalytics[0];
      const pct =
        allRangeExpense > 0 ? (topCat.total / allRangeExpense) * 100 : 0;
      insights.push(
        `📊 "${topCat.icon} ${topCat.name}" adalah kategori pengeluaran terbesar (${pct.toFixed(0)}% dari total). Rata-rata ${formatCurrency(topCat.avgAmount)} per transaksi.`,
      );
    }

    // Day of week insight
    if (dayOfWeekSpending.length > 0) {
      const mostActive = dayOfWeekSpending.reduce((a, b) =>
        a.total > b.total ? a : b,
      );
      insights.push(
        `📅 Hari ${mostActive.dow.trim()} adalah hari paling boros dengan total ${formatCurrency(mostActive.total)} dari ${mostActive.count} transaksi.`,
      );
    }

    // Fee insight
    if (totalFee > 0) {
      insights.push(
        `💸 Total biaya admin: ${formatCurrency(totalFee)}. Pertimbangkan metode pembayaran dengan fee lebih rendah.`,
      );
    }

    // Missing period insight
    const totalDays = dailySpending.length;
    if (totalDays > 0 && totalDays < days * 0.5) {
      insights.push(
        `📝 Hanya ${totalDays} dari ${days} hari yang memiliki transaksi tercatat. Jangan lupa catat setiap pengeluaran!`,
      );
    }

    return NextResponse.json({
      dailySpending,
      categoryAnalytics: categoryAnalytics.map((c) => ({
        ...c,
        percentage: allRangeExpense > 0 ? (c.total / allRangeExpense) * 100 : 0,
      })),
      incomeExpenseRatio: {
        totalIncome: ratio?.totalIncome ?? 0,
        totalExpense: ratio?.totalExpense ?? 0,
        totalFee,
        netBalance:
          (ratio?.totalIncome ?? 0) - (ratio?.totalExpense ?? 0) - totalFee,
      },
      burnRate: {
        monthlyAverage: burnRate,
        emergencyFund3Month: burnRate * 3,
        emergencyFund6Month: burnRate * 6,
      },
      billToIncome: {
        totalMonthlyBills,
        billCount,
        avgMonthlyIncome,
        ratio: billToIncomeRatio,
      },
      weeklyTrend,
      largestTransactions,
      dayOfWeekSpending,
      insights,
      period: { days, range },
    });
  } catch (error) {
    logger.error(
      { route: "GET /api/insights", err: String(error) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal mengambil insight" },
      { status: 500 },
    );
  }
}

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}
