import { boolean, index, numeric, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { messageTypeEnum, transactionTypeEnum } from './enums';
import { users } from './users';
import { rawMessages } from './raw-messages';
import { transactionCategories } from './transaction-categories';
import { paymentMethods } from './payment-methods';

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
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Nullable karena raw message bisa dihapus (onDelete: SET NULL) */
    rawMessageId: uuid('raw_message_id').references(() => rawMessages.id, {
      onDelete: 'set null',
    }),
    categoryId: uuid('category_id').references(() => transactionCategories.id, {
      onDelete: 'set null',
    }),
    /** Sumber dana / metode bayar keluar */
    paymentMethodId: uuid('payment_method_id').references(() => paymentMethods.id, {
      onDelete: 'set null',
    }),
    /**
     * Rekening/wallet tujuan transfer.
     * WAJIB diisi jika type = 'transfer'.
     * HARUS null jika type = 'expense' atau 'income'.
     */
    toPaymentMethodId: uuid('to_payment_method_id').references(() => paymentMethods.id, {
      onDelete: 'set null',
    }),
    type: transactionTypeEnum('type').notNull(),
    /**
     * Nominal transaksi. Selalu positif.
     * Untuk transfer: nominal yang dikirim ke tujuan (bukan total keluar).
     */
    amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
    /**
     * Biaya admin / transfer fee. Default 0.
     * Contoh: transfer antar bank kena Rp 2.500 → fee = 2500.
     * Tidak boleh negatif.
     */
    fee: numeric('fee', { precision: 15, scale: 2 }).default('0').notNull(),
    /**
     * Stored computed: amount + fee.
     * Untuk expense/income: sama dengan amount (fee = 0).
     * Untuk transfer: total yang benar-benar keluar dari sumber.
     * Dihitung di application layer sebelum insert.
     */
    totalAmount: numeric('total_amount', { precision: 15, scale: 2 }).notNull(),
    /** Keterangan biaya tambahan, contoh: "biaya transfer beda bank", "admin bulanan" */
    feeNote: text('fee_note'),
    currency: text('currency').default('IDR').notNull(),
    merchant: text('merchant'),
    location: text('location'),
    notes: text('notes'),
    /** Tipe pesan sumber: dari mana transaksi ini berasal (text/voice/image) */
    sourceType: messageTypeEnum('source_type').notNull(),
    /** Confidence score dari AI extraction, range 0.0–1.0 */
    confidenceScore: real('confidence_score'),
    /** False jika confidenceScore < 0.5, menandakan butuh review manual */
    isConfirmed: boolean('is_confirmed').default(true).notNull(),
    /** Soft delete flag */
    isDeleted: boolean('is_deleted').default(false).notNull(),
    /** Waktu transaksi terjadi, bisa berbeda dari createdAt */
    transactionDate: timestamp('transaction_date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('idx_transactions_user_id_date').on(t.userId, t.transactionDate),
    index('idx_transactions_user_id_type').on(t.userId, t.type),
    index('idx_transactions_category_id').on(t.categoryId),
    index('idx_transactions_payment_method_id').on(t.paymentMethodId),
    index('idx_transactions_to_payment_method_id').on(t.toPaymentMethodId),
    index('idx_transactions_is_deleted').on(t.isDeleted),
    index('idx_transactions_is_confirmed').on(t.isConfirmed),
  ],
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
