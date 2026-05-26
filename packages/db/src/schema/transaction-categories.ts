import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { transactionTypeEnum } from "./enums";
import { users } from "./users";

/**
 * Tabel referensi kategori transaksi.
 * Dibedakan per transactionType karena kategori income ≠ expense ≠ transfer.
 * userId = NULL berarti kategori global/default (seeded).
 * userId terisi berarti kategori custom milik user tersebut.
 */
export const transactionCategories = pgTable(
  "transaction_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = global default, terisi = custom milik user */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Contoh: 'food', 'transport', 'salary'. Unik per user (atau global jika userId null) */
    slug: text("slug").notNull(),
    type: transactionTypeEnum("type").notNull(),
    /** Emoji icon */
    icon: text("icon"),
    /** Hex color untuk UI */
    color: text("color"),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_transaction_categories_type").on(t.type),
    index("idx_transaction_categories_user_id").on(t.userId),
    index("idx_transaction_categories_is_default").on(t.isDefault),
  ],
);

export type TransactionCategory = typeof transactionCategories.$inferSelect;
export type NewTransactionCategory = typeof transactionCategories.$inferInsert;
