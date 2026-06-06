import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getDb, users } from "@fincore/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/settings
 *
 * Returns the current user's profile and preferences.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        reportSchedule: user.reportSchedule,
        reportTime: user.reportTime,
        onboardedAt: user.onboardedAt,
        createdAt: user.createdAt,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json(
      { error: "Gagal memuat pengaturan" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/settings
 *
 * Update user profile & preferences.
 * Only fields sent in the body are updated.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();

    const body = await request.json();

    // Whitelist of allowed fields
    const allowedFields: Record<string, (val: any) => string | null> = {
      name: (val) => {
        if (typeof val !== "string") return "Nama harus berupa teks";
        if (val.length < 1) return "Nama tidak boleh kosong";
        if (val.length > 100) return "Nama maksimal 100 karakter";
        return null;
      },
      reportSchedule: (val) => {
        const valid = ["daily", "weekly", "monthly", "off"];
        if (typeof val !== "string" || !valid.includes(val)) {
          return "Jadwal laporan tidak valid";
        }
        return null;
      },
      reportTime: (val) => {
        if (typeof val !== "string" || !/^\d{2}:\d{2}$/.test(val)) {
          return "Format waktu tidak valid (HH:MM)";
        }
        const [hh, mm] = val.split(":").map(Number);
        if (hh > 23 || mm > 59) return "Jam/Menit tidak valid";
        return null;
      },
    };

    const updates: Record<string, any> = {};

    for (const [key, validator] of Object.entries(allowedFields)) {
      if (key in body) {
        const error = validator(body[key]);
        if (error) {
          return NextResponse.json({ error }, { status: 400 });
        }
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang valid untuk di-update" },
        { status: 400 },
      );
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        reportSchedule: users.reportSchedule,
        reportTime: users.reportTime,
      });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error(
      { route: "PATCH /api/settings", err: String(err) },
      "Request failed",
    );
    return NextResponse.json(
      { error: "Gagal menyimpan pengaturan" },
      { status: 500 },
    );
  }
}
