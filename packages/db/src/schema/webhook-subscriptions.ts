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
 * sebagai bootstrap shortcut saat startup - bukan source of truth.
 * Setelah upsert ke tabel ini, semua management dilakukan via DB.
 *
 * Business Rules:
 * - `encryptedSecret` HARUS bcrypt hash, JANGAN simpan plaintext.
 * - `eventTypes` = ['*'] berarti subscribe semua event types.
 * - `name` bersifat unique dan digunakan sebagai key untuk env bootstrap upsert.
 */
export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: text("name").notNull().unique(),
    url: text("url").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    eventTypes: text("event_types")
      .array()
      .notNull()
      .default(sql`ARRAY['*']`),
    isActive: boolean("is_active").default(true).notNull(),
    timeoutMs: integer("timeout_ms").default(10_000).notNull(),
    maxRetries: integer("max_retries").default(3).notNull(),
    lastTriggeredAt: timestamp("last_triggered_at"),
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
    eventId: uuid("event_id").notNull(),
    subscriptionId: uuid("subscription_id")
      .references(() => webhookSubscriptions.id, { onDelete: "cascade" })
      .notNull(),
    attempt: integer("attempt").default(1).notNull(),
    statusCode: integer("status_code"),
    durationMs: integer("duration_ms"),
    success: boolean("success").default(false).notNull(),
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
