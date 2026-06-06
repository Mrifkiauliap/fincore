import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** Kategori event analitik */
export const analyticsEventCategoryEnum = pgEnum("analytics_event_category", [
  "user",
  "transaction",
  "ai",
  "queue",
  "system",
]);

/**
 * Tabel agregat event analitik untuk tracking usage, performa, dan observability.
 *
 * Setiap event mewakili satu aksi signifikan dalam sistem:
 * - user.onboarded, user.login → product analytics (DAU, retention)
 * - transaction.created, transaction.confirmed → transaction volume
 * - ai.extraction.completed, ai.extraction.failed → AI cost & reliability
 * - queue.job.completed, queue.job.failed → queue observability
 *
 * Metadata JSONB menyimpan data kontekstual (userId, duration, tokens, dll).
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    category: analyticsEventCategoryEnum("category").notNull(),
    event: text("event").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_analytics_events_category").on(t.category),
    index("idx_analytics_events_event").on(t.event),
    index("idx_analytics_events_user_id").on(t.userId),
    index("idx_analytics_events_created_at").on(t.createdAt),
  ],
);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
