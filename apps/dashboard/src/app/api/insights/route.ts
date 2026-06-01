import { getCurrentUser } from "@/lib/auth";
import { getDb, transactions } from "@fincore/db";
import dayjs from "dayjs";
import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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
    const rangeStart = dayjs().subtract(days, "day").startOf("day").toDate();

    const baseConditions = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
      eq(transactions.isConfirmed, true),
    ];

    const rangeConditions = [
      ...baseConditions,
      gte(transactions.transactionDate, rangeStart),
    ];

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

    // === Income vs Expense ratio (pie chart data) ===
    const [incomeExpenseRatio] = await db
      .select({
        totalIncome: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalExpense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), 0)`,
        totalFee: sql<number>`COALESCE(SUM(${transactions.fee}), 0)`,
      })
      .from(transactions)
      .where(and(...rangeConditions));

    // === Weekly trend (last 4 weeks) ===
    const fourWeeksAgo = dayjs().subtract(4, "week").startOf("week").toDate();
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
            dayjs().subtract(90, "day").toDate(),
          ),
        ),
      )
      .groupBy(
        sql`TO_CHAR(${transactions.transactionDate}, 'Day')`,
        sql`EXTRACT(DOW FROM ${transactions.transactionDate})`,
      )
      .orderBy(sql`EXTRACT(DOW FROM ${transactions.transactionDate})`);

    // === AI-generated insights ===
    const insights: string[] = [];

    const ratio = incomeExpenseRatio;
    if (ratio) {
      const savingsRate =
        ratio.totalIncome > 0
          ? ((ratio.totalIncome - ratio.totalExpense) / ratio.totalIncome) * 100
          : 0;
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
          `🔴 Pengeluaran melebihi pemasukan sebesar ${formatCurrency(Math.abs(ratio.totalIncome - ratio.totalExpense - ratio.totalFee))} dalam ${days} hari terakhir. Segera kurangi pengeluaran!`,
        );
      }
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
    if (ratio && ratio.totalFee > 0) {
      insights.push(
        `💸 Total biaya admin: ${formatCurrency(ratio.totalFee)}. Pertimbangkan metode pembayaran dengan fee lebih rendah.`,
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
      incomeExpenseRatio: ratio
        ? {
            totalIncome: ratio.totalIncome,
            totalExpense: ratio.totalExpense,
            totalFee: ratio.totalFee,
            netBalance: ratio.totalIncome - ratio.totalExpense - ratio.totalFee,
          }
        : { totalIncome: 0, totalExpense: 0, totalFee: 0, netBalance: 0 },
      weeklyTrend,
      largestTransactions,
      dayOfWeekSpending,
      insights,
      period: { days, range },
    });
  } catch (error) {
    console.error("GET /api/insights error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil insight" },
      { status: 500 },
    );
  }
}

function formatCurrency(amount: number, currency = "IDR"): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
