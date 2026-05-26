import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { AiExtractionOutput } from '@fincore/contracts';
import { rawMessages } from './raw-messages';

/**
 * Tabel penyimpanan semua input/output AI extraction.
 * Krusial untuk debugging, prompt improvement, dan reprocessing.
 * Semua interaksi dengan AI provider disimpan lengkap beserta token usage dan latency.
 */
export const rawAiOutputs = pgTable(
  'raw_ai_outputs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rawMessageId: uuid('raw_message_id')
      .notNull()
      .references(() => rawMessages.id, { onDelete: 'cascade' }),
    /** Prompt yang dikirim ke AI provider */
    prompt: text('prompt').notNull(),
    /** Raw response string dari AI provider */
    response: text('response').notNull(),
    /** Hasil parsing JSON dari response. Null jika parsing gagal */
    parsedOutput: jsonb('parsed_output').$type<AiExtractionOutput | null>(),
    /** Contoh: 'sumopod' */
    provider: text('provider').notNull(),
    /** Contoh: 'gpt-4o-mini' */
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /** Latency pemrosesan dalam milidetik */
    latencyMs: integer('latency_ms'),
    /** True jika parsing response berhasil dan output valid */
    isValid: boolean('is_valid').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_raw_ai_outputs_raw_message_id').on(t.rawMessageId),
    index('idx_raw_ai_outputs_provider').on(t.provider),
  ],
);

export type RawAiOutput = typeof rawAiOutputs.$inferSelect;
export type NewRawAiOutput = typeof rawAiOutputs.$inferInsert;
