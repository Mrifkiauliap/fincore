import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getDb, recurringBills } from "@fincore/db";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Timezone default global */
const TZ = "Asia/Jakarta";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const existing = await db.query.recurringBills.findFirst({
      where: and(eq(recurringBills.id, id), eq(recurringBills.userId, user.id)),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tagihan tidak ditemukan" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.amount !== undefined)
      updateData.amount = body.amount ? String(body.amount) : null;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.dayOfMonth !== undefined)
      updateData.dayOfMonth = body.dayOfMonth || null;
    if (body.paymentMethodId !== undefined)
      updateData.paymentMethodId = body.paymentMethodId || null;
    if (body.categoryId !== undefined)
      updateData.categoryId = body.categoryId || null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.nextReminderAt !== undefined) {
      updateData.nextReminderAt = dayjs(body.nextReminderAt).tz(TZ).toDate();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang diubah" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(recurringBills)
      .set(updateData)
      .where(and(eq(recurringBills.id, id), eq(recurringBills.userId, user.id)))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error(
      { route: "PATCH /api/recurring-bills/[id]", err: String(error) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal mengupdate tagihan" },
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
      .delete(recurringBills)
      .where(and(eq(recurringBills.id, id), eq(recurringBills.userId, user.id)))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Tagihan tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error("DELETE /api/recurring-bills/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus tagihan" },
      { status: 500 },
    );
  }
}
