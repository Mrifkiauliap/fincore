import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Source of truth untuk semua webhook subscriber.
 *
 * Env vars (`FINCORE_WEBHOOK_<NAME>=url|secret|filter`) hanya digunakan
 * sebagai bootstrap shortcut saat startup — bukan source of truth.
 * Setelah upsert ke tabel ini, semua management dilakukan via DB.
 *
 * Business Rules:
 * - `hashedSecret` HARUS bcrypt hash, JANGAN simpan plaintext.
 * - `eventTypes` = ['*'] berarti subscribe semua event types.
 * - `name` bersifat unique dan digunakan sebagai key untuk env bootstrap upsert.
 */
export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Human-readable label. e.g. "Finance Core Production", "Google Sheets Sync".
     * Dipakai untuk env bootstrap: `FINCORE_WEBHOOK_FINANCE_CORE` → name = "FINANCE_CORE".
     * Unique — digunakan sebagai upsert key saat bootstrapFromEnv().
     */
    name: text("name").notNull().unique(),

    /** Target endpoint. e.g. "https://financecore.app/api/events/ingest" */
    url: text("url").notNull(),

    /**
     * bcrypt hash dari shared secret.
     * NEVER store plaintext. Consumer verify payload via HMAC-SHA256 signature header.
     * Header: `X-FinCore-Signature: sha256=<hmac>`
     */
    encryptedSecret: text("encrypted_secret").notNull(),

    /**
     * Filter event apa saja yang di-deliver ke subscriber ini.
     * - ['*']                                         = semua events
     * - ['transaction.created']                       = hanya created
     * - ['transaction.created','transaction.deleted'] = created + deleted
     */
    eventTypes: text("event_types")
      .array()
      .notNull()
      .default(sql`ARRAY['*']`),

    isActive: boolean("is_active").default(true).notNull(),

    /** Timeout per delivery attempt dalam milliseconds. Default 10 detik. */
    timeoutMs: integer("timeout_ms").default(10_000).notNull(),

    /** Maksimal retry per event sebelum dinyatakan failed. Default 3. */
    maxRetries: integer("max_retries").default(3).notNull(),

    // ── Health Tracking ──────────────────────────────────────────────────────
    /** Kapan terakhir kali subscriber ini menerima event (berhasil atau tidak). */
    lastTriggeredAt: timestamp("last_triggered_at"),
    /**
     * HTTP status code dari delivery attempt terakhir.
     * Berguna untuk health monitoring (e.g. subscriber terus return 500).
     */
    lastResponseStatus: integer("last_response_status"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("idx_webhook_subscriptions_name").on(t.name),
    index("idx_webhook_subscriptions_active").on(t.isActive),
  ],
);

export type WebhookSubscriptionRow = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit log per subscriber per event delivery attempt.
 *
 * Berguna untuk:
 * - Debug kenapa consumer tidak menerima event
 * - Monitoring health per subscriber
 * - Manual re-deliver dari Bull Board
 *
 * Note: `eventId` merujuk ke `transactions.event_id` (bukan `transactions.id`).
 */
export const webhookDeliveryLogs = pgTable(
  "webhook_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * = transactions.event_id — public reference ke event yang di-deliver.
     * Bukan FK ke transactions karena transaksi bisa dihapus (soft delete),
     * tapi log harus tetap ada untuk audit.
     */
    eventId: uuid("event_id").notNull(),

    /**
     * FK ke webhook_subscriptions. ON DELETE CASCADE:
     * jika subscriber dihapus, log-nya ikut dihapus.
     */
    subscriptionId: uuid("subscription_id")
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" })
      .notNull(),

    /** Nomor attempt, mulai dari 1. Increment saat retry. */
    attempt: integer("attempt").default(1).notNull(),

    /** HTTP status code yang dikembalikan subscriber. NULL jika timeout/network error. */
    statusCode: integer("status_code"),

    /** Durasi HTTP request dalam milliseconds. */
    durationMs: integer("duration_ms"),

    /** True jika delivery berhasil (statusCode 2xx). */
    success: boolean("success").default(false).notNull(),

    /** Pesan error jika success = false. */
    error: text("error"),

    deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_webhook_delivery_logs_event_id").on(t.eventId),
    index("idx_webhook_delivery_logs_subscription_id").on(t.subscriptionId),
    index("idx_webhook_delivery_logs_success").on(t.success),
  ],
);

export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;
export type NewWebhookDeliveryLog = typeof webhookDeliveryLogs.$inferInsert;
