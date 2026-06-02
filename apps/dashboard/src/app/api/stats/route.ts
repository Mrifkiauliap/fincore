import { getCurrentUser } from "@/lib/auth";
import { getDb, transactions } from "@fincore/db";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;
    const tz = user.timezone ?? undefined;

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const conditions: ReturnType<typeof eq>[] = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
    ];

    if (dateFrom)
      conditions.push(gte(transactions.transactionDate, new Date(dateFrom)));
    if (dateTo)
      conditions.push(lte(transactions.transactionDate, new Date(dateTo)));

    const whereClause = and(...conditions);

    // Summary totals per type
    const [summary] = await db
      .select({
        totalExpense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), '0')`,
        totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), '0')`,
        totalFee: sql<string>`COALESCE(SUM(${transactions.fee}), '0')`,
        transactionCount: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .where(whereClause);

    // Category breakdown for expenses
    const categoryBreakdown = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: sql<string>`COALESCE(tc.name, 'Tanpa Kategori')`,
        categoryIcon: sql<string>`tc.icon`,
        categoryColor: sql<string>`tc.color`,
        total: sql<string>`SUM(${transactions.amount})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(transactions)
      .leftJoin(
        sql`transaction_categories tc`,
        sql`${transactions.categoryId} = tc.id`,
      )
      .where(and(whereClause, eq(transactions.type, "expense")))
      .groupBy(
        transactions.categoryId,
        sql`tc.name`,
        sql`tc.icon`,
        sql`tc.color`,
      )
      .orderBy(sql`SUM(${transactions.amount}) DESC`);

    // Monthly trend (last 6 months)
    const sixMonthsAgo = dayjs()
      .tz(tz)
      .subtract(6, "month")
      .startOf("month")
      .toDate();

    const monthlyTrend = await db
      .select({
        month: sql<string>`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`,
        expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END), '0')`,
        income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END), '0')`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.isDeleted, false),
          gte(transactions.transactionDate, sixMonthsAgo),
        ),
      )
      .groupBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${transactions.transactionDate}, 'YYYY-MM')`);

    // Recent 5 transactions
    const recentTransactions = await db.query.transactions.findMany({
      where: whereClause,
      with: {
        category: true,
        paymentMethod: true,
      },
      orderBy: (tx, { desc }) => desc(tx.transactionDate),
      limit: 5,
    });

    return NextResponse.json({
      summary: {
        totalExpense: parseFloat(summary?.totalExpense ?? "0"),
        totalIncome: parseFloat(summary?.totalIncome ?? "0"),
        totalFee: parseFloat(summary?.totalFee ?? "0"),
        balance:
          parseFloat(summary?.totalIncome ?? "0") -
          parseFloat(summary?.totalExpense ?? "0"),
        transactionCount: parseInt(summary?.transactionCount ?? "0"),
      },
      categoryBreakdown: categoryBreakdown.map((c) => ({
        ...c,
        total: parseFloat(c.total),
        count: parseInt(c.count),
      })),
      monthlyTrend,
      recentTransactions,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil statistik" },
      { status: 500 },
    );
  }
}
