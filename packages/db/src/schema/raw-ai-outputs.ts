import type { AiExtractionOutput } from "@fincore/contracts";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { rawMessages } from "./raw-messages";

/**
 * Tabel penyimpanan semua input/output AI extraction.
 * Krusial untuk debugging, prompt improvement, dan reprocessing.
 * Semua interaksi dengan AI provider disimpan lengkap beserta token usage dan latency.
 */
export const rawAiOutputs = pgTable(
  "raw_ai_outputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawMessageId: uuid("raw_message_id")
      .notNull()
      .references(() => rawMessages.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    response: text("response").notNull(),
    parsedOutput: jsonb("parsed_output").$type<AiExtractionOutput | null>(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    isValid: boolean("is_valid").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_raw_ai_outputs_raw_message_id").on(t.rawMessageId),
    index("idx_raw_ai_outputs_provider").on(t.provider),
  ],
);

export type RawAiOutput = typeof rawAiOutputs.$inferSelect;
export type NewRawAiOutput = typeof rawAiOutputs.$inferInsert;
