import { getCurrentUser } from "@/lib/auth";
import { getDb, paymentMethods } from "@fincore/db";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = await db.query.paymentMethods.findFirst({
      where: and(
        eq(paymentMethods.id, id),
        eq(paymentMethods.userId, user.id), // Hanya bisa edit custom milik sendiri
      ),
    });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Metode pembayaran tidak ditemukan atau Anda tidak memiliki akses",
        },
        { status: 404 },
      );
    }

    const { name, icon, color, type } = body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (type !== undefined) updateData.type = type;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang diubah" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(paymentMethods)
      .set(updateData)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, user.id)))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/payment-methods/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengupdate metode pembayaran" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const db = getDb();

    // Hapus fisik untuk master data custom
    const [deleted] = await db
      .delete(paymentMethods)
      .where(and(eq(paymentMethods.id, id), eq(paymentMethods.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        {
          error:
            "Metode pembayaran tidak ditemukan atau Anda tidak memiliki akses",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error("DELETE /api/payment-methods/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus metode pembayaran" },
      { status: 500 },
    );
  }
}
