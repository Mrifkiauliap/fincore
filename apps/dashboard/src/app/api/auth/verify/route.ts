import { getDb, sessions } from "@fincore/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Token tidak ditemukan" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Hash the token since it's stored hashed in the DB
  const crypto = await import("crypto");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  // Cari session yang cocok dengan magic token ini
  const sessionRecord = await db.query.sessions.findFirst({
    where: eq(sessions.magicToken, hashedToken),
  });

  if (!sessionRecord) {
    return NextResponse.json(
      { error: "Token tidak valid atau sudah kadaluarsa" },
      { status: 401 },
    );
  }

  // Cek apakah token sudah expired
  if (
    !sessionRecord.magicTokenExpiresAt ||
    new Date() > sessionRecord.magicTokenExpiresAt
  ) {
    return NextResponse.json(
      { error: "Token sudah kadaluarsa. Silakan minta link baru di WhatsApp." },
      { status: 401 },
    );
  }

  // Hapus magic token agar tidak bisa dipakai lagi (One-Time Use)
  await db
    .update(sessions)
    .set({
      magicToken: null,
      magicTokenExpiresAt: null,
      // Perpanjang sesi 7 hari
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .where(eq(sessions.id, sessionRecord.id));

  // Set HTTP-Only Cookie
  const cookieStore = await cookies();
  cookieStore.set("fincore_session", sessionRecord.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
  });

  // Redirect ke dashboard
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
