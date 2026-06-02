import { getDb, sessions, type User } from "@fincore/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * Mendapatkan user yang sedang login berdasarkan session cookie.
 * Menggunakan React cache() agar satu request hanya query DB sekali.
 * Akan redirect ke /login jika tidak ada sesi valid.
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("fincore_session")?.value;

  if (!sessionId) {
    redirect("/login");
  }

  const db = getDb();
  const sessionRecord = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: {
      user: true,
    },
  });

  if (
    !sessionRecord ||
    !sessionRecord.user ||
    new Date() > sessionRecord.expiresAt
  ) {
    // Redirect to logout to clear the invalid cookie
    redirect("/logout");
  }

  // Sliding Session: Perpanjang di database jika sisa umur sesi < 3 hari
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  const timeRemaining = sessionRecord.expiresAt.getTime() - Date.now();
  if (timeRemaining < threeDaysInMs) {
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Jalankan tanpa await agar tidak ngeblok rendering
    db.update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, sessionId))
      .execute()
      .catch((err) => console.error("Failed to update session expiry", err));
  }

  return sessionRecord.user;
});

/**
 * Mendapatkan user ID saja (lebih ringan), tanpa redirect.
 * Return null jika tidak login.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("fincore_session")?.value;

  if (!sessionId) return null;

  const db = getDb();
  const sessionRecord = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });

  if (!sessionRecord || new Date() > sessionRecord.expiresAt) {
    return null;
  }

  // Sliding Session: Perpanjang di database jika sisa umur sesi < 3 hari
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  const timeRemaining = sessionRecord.expiresAt.getTime() - Date.now();
  if (timeRemaining < threeDaysInMs) {
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Jalankan tanpa await agar tidak ngeblok rendering
    db.update(sessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(sessions.id, sessionId))
      .execute()
      .catch((err) => console.error("Failed to update session expiry", err));
  }

  return sessionRecord.userId;
}
