import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { paymentMethods } from "./payment-methods";
import { transactionCategories } from "./transaction-categories";
import { users } from "./users";

/**
 * Tagihan berulang yang akan diingatkan secara otomatis.
 * Bot mengirim reminder H-1 sebelum tanggal jatuh tempo.
 */
export const recurringBills = pgTable(
  "recurring_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Listrik PLN", "Spotify", dll
    amount: numeric("amount", { precision: 15, scale: 2 }),
    currency: text("currency").default("IDR").notNull(),
    /** Metode pembayaran yang biasa digunakan (opsional) */
    paymentMethodId: uuid("payment_method_id").references(
      () => paymentMethods.id,
      { onDelete: "set null" },
    ),
    categoryId: uuid("category_id").references(() => transactionCategories.id, {
      onDelete: "set null",
    }),
    /** Frekuensi tagihan: DAILY, WEEKLY, MONTHLY, YEARLY */
    frequency: text("frequency", {
      enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
    })
      .default("MONTHLY")
      .notNull(),
    /** Tanggal jatuh tempo (1–31) untuk MONTHLY/YEARLY. */
    dayOfMonth: integer("day_of_month"),
    /** Hari dalam seminggu (0=Minggu, 1=Senin, ..., 6=Sabtu) untuk WEEKLY. */
    dayOfWeek: integer("day_of_week"),
    /** Tanggal reminder dikirim = dayOfMonth - 1 (H-1) atau sesuai logic frequency */
    reminderDayOffset: integer("reminder_day_offset").default(-1).notNull(),
    /** Kapan reminder berikutnya akan dikirim */
    nextReminderAt: timestamp("next_reminder_at").notNull(),
    /** Kapan terakhir reminder dikirim */
    lastReminderAt: timestamp("last_reminder_at"),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("idx_recurring_bills_user_id").on(t.userId),
    index("idx_recurring_bills_next_reminder").on(t.nextReminderAt),
    index("idx_recurring_bills_is_active").on(t.isActive),
  ],
);

export type RecurringBill = typeof recurringBills.$inferSelect;
export type NewRecurringBill = typeof recurringBills.$inferInsert;
