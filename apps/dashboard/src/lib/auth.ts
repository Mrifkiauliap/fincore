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
    redirect("/api/auth/logout");
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

  return sessionRecord.userId;
}
