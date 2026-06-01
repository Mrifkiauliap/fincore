import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/**
 * Tabel sessions untuk mengelola Autentikasi FinCore Dashboard.
 * Berfungsi ganda:
 * 1. Menyimpan `magicToken` (OTP) untuk login via WA.
 * 2. Menyimpan sesi aktif (Session ID) setelah token WA divalidasi.
 */
export const sessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    magicToken: text("magic_token").unique(),
    magicTokenExpiresAt: timestamp("magic_token_expires_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sessions_user_id").on(t.userId),
    index("idx_sessions_magic_token").on(t.magicToken),
  ],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
