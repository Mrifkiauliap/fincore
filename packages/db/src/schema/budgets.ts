import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { transactionCategories } from "./transaction-categories";
import { users } from "./users";

/**
 * Tabel anggaran (budgets) pengguna.
 * Mencatat target batas pengeluaran bulanan per kategori.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => transactionCategories.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    currency: text("currency").default("IDR").notNull(),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    lastWarningSentAt: timestamp("last_warning_sent_at"),
    lastAlertSentAt: timestamp("last_alert_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    unique("uq_budgets_user_cat_month_year").on(
      t.userId,
      t.categoryId,
      t.month,
      t.year,
    ),
    index("idx_budgets_user_month_year").on(t.userId, t.month, t.year),
  ],
);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
