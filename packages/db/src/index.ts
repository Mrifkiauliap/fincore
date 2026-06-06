import getConfig from "@fincore/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: ReturnType<typeof initDb>;
let _initError: Error | null = null;

function initDb() {
  const dbUrl = getConfig("DATABASE_URL");
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL tidak ditemukan. Pastikan environment variable sudah di-set.",
    );
  }
  const pool = new Pool({
    connectionString: dbUrl as string,
  });
  return drizzle(pool, { schema });
}

export function getDb() {
  if (_initError) throw _initError;
  if (!_db) {
    try {
      _db = initDb();
    } catch (err) {
      _initError = err as Error;
      throw err;
    }
  }
  return _db;
}

export * from "./schema";

// ─── Analytics Helper ───────────────────────────────────────────────────────────

import type { NewAnalyticsEvent } from "./schema/analytics-events";
import { analyticsEvents } from "./schema/analytics-events";

/**
 * Fire-and-forget insert ke analytics_events.
 * Tidak mengganggu main flow — error di sini hanya di-log.
 */
export async function trackEvent(event: NewAnalyticsEvent): Promise<void> {
  try {
    const db = getDb();
    await db.insert(analyticsEvents).values(event);
  } catch (err) {
    // Jangan ganggu main flow
    console.error("[analytics] Failed to insert event:", err);
  }
}
