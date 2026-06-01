import { getCurrentUser } from "@/lib/auth";
import { getDb, transactions } from "@fincore/db";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const db = getDb();

    const transaction = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, id),
        eq(transactions.userId, user.id),
        eq(transactions.isDeleted, false),
      ),
      with: {
        category: true,
        paymentMethod: true,
        toPaymentMethod: true,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: transaction });
  } catch (error) {
    console.error("GET /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil transaksi" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.userId, user.id)),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.categoryId !== undefined)
      updateData.categoryId = body.categoryId || null;
    if (body.paymentMethodId !== undefined)
      updateData.paymentMethodId = body.paymentMethodId || null;
    if (body.toPaymentMethodId !== undefined)
      updateData.toPaymentMethodId = body.toPaymentMethodId || null;
    if (body.merchant !== undefined)
      updateData.merchant = body.merchant || null;
    if (body.location !== undefined)
      updateData.location = body.location || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.isConfirmed !== undefined)
      updateData.isConfirmed = body.isConfirmed;
    if (body.transactionDate !== undefined) {
      updateData.transactionDate = new Date(body.transactionDate);
    }

    if (body.amount !== undefined || body.fee !== undefined) {
      const amount =
        body.amount !== undefined
          ? parseFloat(body.amount)
          : parseFloat(existing.amount);
      const fee =
        body.fee !== undefined
          ? parseFloat(body.fee)
          : parseFloat(existing.fee);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "Jumlah transaksi harus lebih dari 0" },
          { status: 400 },
        );
      }
      updateData.amount = amount.toFixed(2);
      updateData.fee = (isNaN(fee) ? 0 : fee).toFixed(2);
      updateData.totalAmount = (amount + (isNaN(fee) ? 0 : fee)).toFixed(2);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang diubah" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(transactions)
      .set(updateData)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengupdate transaksi" },
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

    // Soft delete
    const [deleted] = await db
      .update(transactions)
      .set({ isDeleted: true })
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error("DELETE /api/transactions/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus transaksi" },
      { status: 500 },
    );
  }
}
