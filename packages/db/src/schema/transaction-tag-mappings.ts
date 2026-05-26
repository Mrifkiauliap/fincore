import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { transactions } from './transactions';
import { transactionTags } from './transaction-tags';

/**
 * Tabel mapping many-to-many antara transaksi dan tag.
 * Setiap kombinasi (transactionId, tagId) unik.
 */
export const transactionTagMappings = pgTable(
  'transaction_tag_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => transactionTags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_transaction_tag_mappings_transaction_id').on(t.transactionId),
    index('idx_transaction_tag_mappings_tag_id').on(t.tagId),
    uniqueIndex('idx_transaction_tag_mappings_unique').on(t.transactionId, t.tagId),
  ],
);

export type TransactionTagMapping = typeof transactionTagMappings.$inferSelect;
export type NewTransactionTagMapping = typeof transactionTagMappings.$inferInsert;
