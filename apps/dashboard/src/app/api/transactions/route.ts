import { getCurrentUser } from "@/lib/auth";
import { getDb, transactions } from "@fincore/db";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const type = searchParams.get("type"); // expense | income | transfer
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const isConfirmed = searchParams.get("isConfirmed");

    const offset = (page - 1) * limit;
    const conditions: ReturnType<typeof eq>[] = [
      eq(transactions.userId, user.id),
      eq(transactions.isDeleted, false),
    ];

    if (type) {
      conditions.push(
        eq(transactions.type, type as "expense" | "income" | "transfer"),
      );
    }
    if (categoryId) {
      conditions.push(eq(transactions.categoryId, categoryId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(transactions.name, `%${search}%`),
          ilike(transactions.merchant, `%${search}%`),
          ilike(transactions.notes, `%${search}%`),
        )!,
      );
    }
    if (dateFrom) {
      conditions.push(gte(transactions.transactionDate, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(transactions.transactionDate, new Date(dateTo)));
    }
    if (isConfirmed !== null && isConfirmed !== undefined) {
      conditions.push(eq(transactions.isConfirmed, isConfirmed === "true"));
    } else {
      // Default: hanya tampilkan transaksi yang sudah dikonfirmasi
      conditions.push(eq(transactions.isConfirmed, true));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      db.query.transactions.findMany({
        where: whereClause,
        with: {
          category: true,
          paymentMethod: true,
          toPaymentMethod: true,
          tags: {
            with: {
              tag: true,
            },
          },
        },
        orderBy: desc(transactions.transactionDate),
        limit,
        offset,
      }),
      db
        .select({ count: sql<string>`count(*)` })
        .from(transactions)
        .where(whereClause)
        .then((r) => r[0]),
    ]);

    const total = parseInt(countResult?.count ?? "0");
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil data transaksi" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const body = await request.json();

    const {
      name,
      type,
      amount,
      fee = 0,
      currency = "IDR",
      categoryId,
      paymentMethodId,
      toPaymentMethodId,
      merchant,
      location,
      notes,
      transactionDate,
      sourceType = "text",
      isConfirmed = true,
    } = body;

    // Validasi dasar
    if (!name || !type || !amount) {
      return NextResponse.json(
        { error: "Nama, tipe, dan jumlah transaksi wajib diisi" },
        { status: 400 },
      );
    }

    const numAmount = parseFloat(amount);
    const numFee = parseFloat(fee);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { error: "Jumlah transaksi harus lebih dari 0" },
        { status: 400 },
      );
    }

    const totalAmount = numAmount + numFee;

    const [newTransaction] = await db
      .insert(transactions)
      .values({
        name,
        userId: user.id,
        type,
        amount: numAmount.toFixed(2),
        fee: numFee.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        currency: currency || "IDR",
        categoryId: categoryId || null,
        paymentMethodId: paymentMethodId || null,
        toPaymentMethodId: toPaymentMethodId || null,
        merchant: merchant || null,
        location: location || null,
        notes: notes || null,
        transactionDate: transactionDate
          ? new Date(transactionDate)
          : new Date(),
        sourceType,
        isConfirmed,
      })
      .returning();

    return NextResponse.json({ data: newTransaction }, { status: 201 });
  } catch (error) {
    console.error("POST /api/transactions error:", error);
    return NextResponse.json(
      { error: "Gagal membuat transaksi" },
      { status: 500 },
    );
  }
}
