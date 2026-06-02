import { getCurrentUser } from "@/lib/auth";
import { getDb, recurringBills } from "@fincore/db";
import { DEFAULT_TIMEZONE } from "@fincore/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();

    const bills = await db.query.recurringBills.findMany({
      where: eq(recurringBills.userId, user.id),
      with: {
        category: true,
        paymentMethod: true,
      },
      orderBy: asc(recurringBills.nextReminderAt),
    });

    return NextResponse.json({ data: bills });
  } catch (error) {
    console.error("GET /api/recurring-bills error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil tagihan berulang" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const body = await request.json();
    const tz = user.timezone ?? DEFAULT_TIMEZONE;

    const {
      name,
      amount,
      frequency = "MONTHLY",
      dayOfMonth,
      paymentMethodId,
      categoryId,
      notes,
      nextReminderAt,
    } = body;

    if (!name || !nextReminderAt) {
      return NextResponse.json(
        { error: "Nama dan tanggal reminder wajib diisi" },
        { status: 400 },
      );
    }

    const [bill] = await db
      .insert(recurringBills)
      .values({
        userId: user.id,
        name,
        amount: amount ? String(amount) : null,
        frequency,
        dayOfMonth: dayOfMonth || null,
        paymentMethodId: paymentMethodId || null,
        categoryId: categoryId || null,
        notes: notes || null,
        nextReminderAt: dayjs(nextReminderAt).tz(tz).toDate(),
        isActive: true,
      })
      .returning();

    return NextResponse.json({ data: bill }, { status: 201 });
  } catch (error) {
    console.error("POST /api/recurring-bills error:", error);
    return NextResponse.json(
      { error: "Gagal membuat tagihan berulang" },
      { status: 500 },
    );
  }
}
