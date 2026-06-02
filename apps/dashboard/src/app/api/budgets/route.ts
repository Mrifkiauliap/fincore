import { getCurrentUser } from "@/lib/auth";
import { budgets, getDb, transactions } from "@fincore/db";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, asc, eq, sql, sum } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;
    const tz = user.timezone ?? undefined;
    const now = dayjs().tz(tz);
    const year = parseInt(searchParams.get("year") || String(now.year()));
    const month = parseInt(
      searchParams.get("month") || String(now.month() + 1),
    );

    const allBudgets = await db.query.budgets.findMany({
      where: and(
        eq(budgets.userId, user.id),
        eq(budgets.isActive, true),
        eq(budgets.month, month),
        eq(budgets.year, year),
      ),
      with: {
        category: true,
      },
      orderBy: asc(budgets.createdAt),
    });

    // Calculate actual spending per budget
    const startOfMonth = dayjs()
      .tz(tz)
      .year(year)
      .month(month - 1)
      .startOf("month")
      .toDate();
    const endOfMonth = dayjs()
      .tz(tz)
      .year(year)
      .month(month - 1)
      .endOf("month")
      .toDate();

    const budgetWithUsage = await Promise.all(
      allBudgets.map(async (budget) => {
        const [result] = await db
          .select({ spent: sum(transactions.amount) })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, user.id),
              eq(transactions.categoryId, budget.categoryId),
              eq(transactions.type, "expense"),
              eq(transactions.isDeleted, false),
              sql`${transactions.transactionDate} >= ${startOfMonth}`,
              sql`${transactions.transactionDate} <= ${endOfMonth}`,
            ),
          );

        const spent = parseFloat(result?.spent ?? "0");
        const budgetAmount = parseFloat(budget.amount);
        const percentage = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;

        return {
          ...budget,
          spent,
          percentage: Math.min(percentage, 100),
          status:
            percentage >= 100 ? "over" : percentage >= 80 ? "warning" : "safe",
        };
      }),
    );

    return NextResponse.json({ data: budgetWithUsage });
  } catch (error) {
    console.error("GET /api/budgets error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil budget" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const body = await request.json();

    const { categoryId, amount, month, year, notes } = body;
    if (!categoryId || !amount || !month || !year) {
      return NextResponse.json(
        { error: "Kategori, jumlah, bulan, dan tahun wajib diisi" },
        { status: 400 },
      );
    }

    const [budget] = await db
      .insert(budgets)
      .values({
        userId: user.id,
        categoryId,
        amount: String(amount),
        month,
        year,
        notes: notes || null,
      })
      .returning();

    return NextResponse.json({ data: budget }, { status: 201 });
  } catch (error) {
    console.error("POST /api/budgets error:", error);
    return NextResponse.json(
      { error: "Gagal membuat budget" },
      { status: 500 },
    );
  }
}
