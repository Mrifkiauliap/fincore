import { index, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rawMessages } from './raw-messages';

/**
 * Tabel penyimpanan hasil Groq Whisper transcription dari voice note.
 * Disimpan raw agar bisa direproses jika ada perbaikan model atau prompt.
 */
export const rawTranscriptions = pgTable(
  'raw_transcriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rawMessageId: uuid('raw_message_id')
      .notNull()
      .references(() => rawMessages.id, { onDelete: 'cascade' }),
    transcript: text('transcript').notNull(),
    language: text('language').default('id').notNull(),
    /** Durasi audio dalam detik */
    durationSeconds: real('duration_seconds'),
    /** Contoh: 'groq-whisper-large-v3' */
    provider: text('provider').notNull(),
    modelVersion: text('model_version'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_raw_transcriptions_raw_message_id').on(t.rawMessageId)],
);

export type RawTranscription = typeof rawTranscriptions.$inferSelect;
export type NewRawTranscription = typeof rawTranscriptions.$inferInsert;
