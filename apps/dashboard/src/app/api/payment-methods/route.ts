import { getCurrentUser } from "@/lib/auth";
import { getDb, paymentMethods } from "@fincore/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");

    const conditions: ReturnType<typeof eq>[] = [
      eq(paymentMethods.isActive, true),
      or(isNull(paymentMethods.userId), eq(paymentMethods.userId, user.id))!,
    ];

    if (type) {
      conditions.push(
        eq(paymentMethods.type, type as typeof paymentMethods.type._.data),
      );
    }

    const methods = await db.query.paymentMethods.findMany({
      where: and(...conditions),
      orderBy: asc(paymentMethods.type),
    });

    return NextResponse.json({ data: methods });
  } catch (error) {
    console.error("GET /api/payment-methods error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil metode pembayaran" },
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
        { error: "Nama dan tipe metode pembayaran wajib diisi" },
        { status: 400 },
      );
    }

    const [method] = await db
      .insert(paymentMethods)
      .values({
        name,
        type,
        icon: icon || null,
        color: color || null,
        userId: user.id,
        isActive: true,
      })
      .returning();

    return NextResponse.json({ data: method }, { status: 201 });
  } catch (error) {
    console.error("POST /api/payment-methods error:", error);
    return NextResponse.json(
      { error: "Gagal membuat metode pembayaran" },
      { status: 500 },
    );
  }
}
