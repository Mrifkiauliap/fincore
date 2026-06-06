import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Tabel pengguna FinCore.
 * Diidentifikasi berdasarkan nomor WhatsApp (format: 628xxxxxxxxxx).
 * Timezone selalu "Asia/Jakarta" dan currency selalu "IDR" secara global.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull().unique(),
    name: text("name"),
    isActive: boolean("is_active").default(true).notNull(),
    onboardedAt: timestamp("onboarded_at"),
    reportSchedule: text("report_schedule").default("monthly"),
    reportTime: text("report_time").default("07:00"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("idx_users_phone").on(t.phone)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
