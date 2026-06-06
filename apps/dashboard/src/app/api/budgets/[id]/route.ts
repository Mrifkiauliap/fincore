import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { budgets, getDb } from "@fincore/db";
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

    const existing = await db.query.budgets.findFirst({
      where: and(eq(budgets.id, id), eq(budgets.userId, user.id)),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Budget tidak ditemukan" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
    if (body.amount !== undefined)
      updateData.amount = body.amount ? String(body.amount) : "0";
    if (body.month !== undefined) updateData.month = body.month;
    if (body.year !== undefined) updateData.year = body.year;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang diubah" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(budgets)
      .set(updateData)
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error(
      { route: "PATCH /api/budgets/[id]", err: String(error) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal mengupdate budget" },
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

    const [deleted] = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Budget tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error("DELETE /api/budgets/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus budget" },
      { status: 500 },
    );
  }
}
