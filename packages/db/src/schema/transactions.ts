import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { messageTypeEnum, transactionTypeEnum } from "./enums";
import { paymentMethods } from "./payment-methods";
import { rawMessages } from "./raw-messages";
import { transactionCategories } from "./transaction-categories";
import { users } from "./users";

/**
 * Tabel utama transaksi keuangan yang sudah dinormalisasi oleh AI.
 *
 * Business Rules:
 * - `totalAmount` HARUS selalu = `amount + fee`. Validasi di application layer sebelum insert.
 * - `toPaymentMethodId` WAJIB diisi jika `type = 'transfer'`, HARUS null jika `type = 'expense'` atau `'income'`.
 * - `fee` tidak boleh negatif.
 * - `amount` tidak boleh 0 atau negatif.
 * - `totalAmount` tidak di-compute di DB (bukan generated column). Dihitung di app layer, disimpan as-is.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawMessageId: uuid("raw_message_id").references(() => rawMessages.id, {
      onDelete: "set null",
    }),
    categoryId: uuid("category_id").references(() => transactionCategories.id, {
      onDelete: "set null",
    }),
    paymentMethodId: uuid("payment_method_id").references(
      () => paymentMethods.id,
      {
        onDelete: "set null",
      },
    ),
    toPaymentMethodId: uuid("to_payment_method_id").references(
      () => paymentMethods.id,
      {
        onDelete: "set null",
      },
    ),
    type: transactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    fee: numeric("fee", { precision: 15, scale: 2 }).default("0").notNull(),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull(),
    feeNote: text("fee_note"),
    currency: text("currency").default("IDR").notNull(),
    merchant: text("merchant"),
    location: text("location"),
    notes: text("notes"),
    sourceType: messageTypeEnum("source_type").notNull(),
    confidenceScore: real("confidence_score"),
    isConfirmed: boolean("is_confirmed").default(true).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    transactionDate: timestamp("transaction_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),

    // ── Event Publishing ──────────────────────────────────────────────────────
    eventId: uuid("event_id").defaultRandom().notNull().unique(),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    index("idx_transactions_user_id_date").on(t.userId, t.transactionDate),
    index("idx_transactions_user_id_type").on(t.userId, t.type),
    index("idx_transactions_category_id").on(t.categoryId),
    index("idx_transactions_payment_method_id").on(t.paymentMethodId),
    index("idx_transactions_to_payment_method_id").on(t.toPaymentMethodId),
    index("idx_transactions_is_deleted").on(t.isDeleted),
    index("idx_transactions_is_confirmed").on(t.isConfirmed),
    index("idx_transactions_unpublished")
      .on(t.isPublished)
      .where(sql`is_published = FALSE`),
    uniqueIndex("idx_transactions_event_id").on(t.eventId),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

import { relations } from "drizzle-orm";

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  rawMessage: one(rawMessages, {
    fields: [transactions.rawMessageId],
    references: [rawMessages.id],
  }),
  category: one(transactionCategories, {
    fields: [transactions.categoryId],
    references: [transactionCategories.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [transactions.paymentMethodId],
    references: [paymentMethods.id],
  }),
  toPaymentMethod: one(paymentMethods, {
    fields: [transactions.toPaymentMethodId],
    references: [paymentMethods.id],
  }),
}));
