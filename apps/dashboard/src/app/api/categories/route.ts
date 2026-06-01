import { getCurrentUser } from "@/lib/auth";
import { getDb, transactionCategories } from "@fincore/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");

    const conditions: ReturnType<typeof eq>[] = [
      eq(transactionCategories.isActive, true),
      or(
        isNull(transactionCategories.userId),
        eq(transactionCategories.userId, user.id),
      )!,
    ];

    if (type) {
      conditions.push(
        eq(
          transactionCategories.type,
          type as "expense" | "income" | "transfer",
        ),
      );
    }

    const categories = await db.query.transactionCategories.findMany({
      where: and(...conditions),
      orderBy: [
        asc(transactionCategories.type),
        asc(transactionCategories.sortOrder),
      ],
    });

    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil kategori" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const body = await request.json();

    const { name, type, icon, color } = body;
    if (!name || !type) {
      return NextResponse.json(
        { error: "Nama dan tipe kategori wajib diisi" },
        { status: 400 },
      );
    }

    const slug = name.toLowerCase().replace(/\s+/g, "_");

    const [category] = await db
      .insert(transactionCategories)
      .values({
        name,
        slug,
        type,
        icon: icon || null,
        color: color || null,
        userId: user.id,
        isDefault: false,
        isActive: true,
        sortOrder: 100,
      })
      .returning();

    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories error:", error);
    return NextResponse.json(
      { error: "Gagal membuat kategori" },
      { status: 500 },
    );
  }
}
