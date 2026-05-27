import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { processingStatusEnum, processingStepEnum } from "./enums";
import { rawMessages } from "./raw-messages";

/**
 * Tabel audit trail setiap step pemrosesan AI per pesan.
 * Berguna untuk debugging bottleneck, failure analysis, dan monitoring pipeline.
 * Setiap step (transcription, ocr, ai_extraction, dll) dicatat terpisah.
 */
export const aiProcessingLogs = pgTable(
  "ai_processing_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawMessageId: uuid("raw_message_id")
      .notNull()
      .references(() => rawMessages.id, { onDelete: "cascade" }),
    step: processingStepEnum("step").notNull(),
    status: processingStatusEnum("status").notNull(),
    provider: text("provider"),
    durationMs: integer("duration_ms"),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>(),
    outputSnapshot: jsonb("output_snapshot").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ai_processing_logs_raw_message_id").on(t.rawMessageId),
    index("idx_ai_processing_logs_step").on(t.step),
    index("idx_ai_processing_logs_status").on(t.status),
  ],
);

export type AiProcessingLog = typeof aiProcessingLogs.$inferSelect;
export type NewAiProcessingLog = typeof aiProcessingLogs.$inferInsert;
