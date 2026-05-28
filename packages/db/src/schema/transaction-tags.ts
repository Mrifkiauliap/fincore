import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Tabel tag untuk mengelompokkan transaksi secara fleksibel.
 * Tag bersifat per-user, nama unik dalam satu user.
 */
export const transactionTags = pgTable(
  "transaction_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_transaction_tags_user_id").on(t.userId),
    uniqueIndex("idx_transaction_tags_user_id_name").on(t.userId, t.name),
  ],
);

export type TransactionTag = typeof transactionTags.$inferSelect;
export type NewTransactionTag = typeof transactionTags.$inferInsert;
