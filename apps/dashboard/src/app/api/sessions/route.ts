import { getCurrentUser } from "@/lib/auth";
import { getDb, sessions } from "@fincore/db";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sessions
 *
 * List all active sessions for the current user.
 * Returns session metadata + a flag indicating which one is current.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();

    // Get current session ID from cookie
    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get("fincore_session")?.value;

    const userSessions = await db.query.sessions.findMany({
      where: eq(sessions.userId, user.id),
      columns: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    });

    const result = userSessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
      // Show first 8 chars of session ID as identifier
      label: `Sesi ${s.id.substring(0, 8)}`,
    }));

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("GET /api/sessions error:", err);
    return NextResponse.json(
      { error: "Gagal mengambil daftar sesi" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/sessions
 *
 * Sign out a specific session (body: { id: string }).
 * Cannot sign out the current session via this endpoint — use /api/auth/logout instead.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();

    const cookieStore = await cookies();
    const currentSessionId = cookieStore.get("fincore_session")?.value;

    const body = await request.json();
    const sessionId = body.id;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Session ID diperlukan" },
        { status: 400 },
      );
    }

    // Prevent signing out current session
    if (sessionId === currentSessionId) {
      return NextResponse.json(
        {
          error:
            "Tidak bisa mengeluarkan sesi saat ini. Gunakan tombol Keluar untuk logout.",
        },
        { status: 400 },
      );
    }

    // Verify session belongs to user
    const [target] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: "Sesi tidak ditemukan" },
        { status: 404 },
      );
    }

    await db.delete(sessions).where(eq(sessions.id, sessionId));

    return NextResponse.json({ data: { deleted: sessionId } });
  } catch (err) {
    console.error("DELETE /api/sessions error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus sesi" },
      { status: 500 },
    );
  }
}
