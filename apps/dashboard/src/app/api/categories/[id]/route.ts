import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getDb, transactionCategories } from "@fincore/db";
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

    const existing = await db.query.transactionCategories.findFirst({
      where: and(
        eq(transactionCategories.id, id),
        eq(transactionCategories.userId, user.id), // Hanya bisa edit custom milik sendiri
      ),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan atau Anda tidak memiliki akses" },
        { status: 404 },
      );
    }

    const { name, icon, color, type } = body;
    const updateData: any = {};
    if (name !== undefined) {
      updateData.name = name;
      updateData.slug = name.toLowerCase().replace(/\s+/g, "_");
    }
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
      .update(transactionCategories)
      .set(updateData)
      .where(
        and(
          eq(transactionCategories.id, id),
          eq(transactionCategories.userId, user.id),
        ),
      )
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error(
      { route: "PATCH /api/categories/[id]", err: String(error) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal mengupdate kategori" },
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
      .delete(transactionCategories)
      .where(
        and(
          eq(transactionCategories.id, id),
          eq(transactionCategories.userId, user.id),
        ),
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan atau Anda tidak memiliki akses" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error("DELETE /api/categories/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus kategori" },
      { status: 500 },
    );
  }
}
