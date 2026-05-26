import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Tabel pengguna FinCore.
 * Diidentifikasi berdasarkan nomor WhatsApp (format: 628xxxxxxxxxx).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nomor WhatsApp pengguna, format: 628xxxxxxxxxx */
    phone: text('phone').notNull().unique(),
    name: text('name'),
    timezone: text('timezone').default('Asia/Jakarta'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('idx_users_phone').on(t.phone)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
