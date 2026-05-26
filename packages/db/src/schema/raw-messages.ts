import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { messageTypeEnum, processingStatusEnum } from './enums';
import { users } from './users';

/**
 * Tabel penyimpanan raw pesan WhatsApp yang masuk dari WAHA webhook.
 * Semua pesan disimpan as-is sebelum diproses. rawPayload tidak pernah ditrim.
 * userId nullable karena user bisa belum register saat pesan pertama masuk.
 */
export const rawMessages = pgTable(
  'raw_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nullable: user mungkin belum register saat message masuk */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** ID unik dari WAHA webhook, digunakan untuk deduplikasi */
    waMessageId: text('wa_message_id').notNull().unique(),
    /** Nomor WhatsApp pengirim */
    from: text('from').notNull(),
    type: messageTypeEnum('type').notNull(),
    /** Isi teks pesan, nullable untuk pesan media */
    body: text('body'),
    /** URL media dari WAHA */
    mediaUrl: text('media_url'),
    mediaMimetype: text('media_mimetype'),
    /** Ukuran file media dalam bytes */
    mediaSize: integer('media_size'),
    /** Full webhook payload, tidak pernah ditrim */
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    processingStatus: processingStatusEnum('processing_status').default('pending').notNull(),
    processingError: text('processing_error'),
    retryCount: integer('retry_count').default(0).notNull(),
    /** Waktu dari webhook, bukan waktu insert ke DB */
    receivedAt: timestamp('received_at').notNull(),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_raw_messages_user_id').on(t.userId),
    index('idx_raw_messages_processing_status').on(t.processingStatus),
    index('idx_raw_messages_received_at').on(t.receivedAt),
    index('idx_raw_messages_wa_message_id').on(t.waMessageId),
  ],
);

export type RawMessage = typeof rawMessages.$inferSelect;
export type NewRawMessage = typeof rawMessages.$inferInsert;
