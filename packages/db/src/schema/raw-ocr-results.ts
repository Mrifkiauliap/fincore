import {
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { rawMessages } from "./raw-messages";

/**
 * Tabel penyimpanan hasil Gemini Vision OCR dari gambar.
 * Disimpan raw agar bisa direproses jika ada perbaikan model atau prompt.
 */
export const rawOcrResults = pgTable(
  "raw_ocr_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawMessageId: uuid("raw_message_id")
      .notNull()
      .references(() => rawMessages.id, { onDelete: "cascade" }),
    extractedText: text("extracted_text").notNull(),
    /** Contoh: 'gemini-1.5-flash' */
    provider: text("provider").notNull(),
    /** Confidence score dari provider, range 0.0–1.0 */
    confidence: real("confidence"),
    /** Full response dari provider untuk keperluan debug */
    rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_raw_ocr_results_raw_message_id").on(t.rawMessageId)],
);

export type RawOcrResult = typeof rawOcrResults.$inferSelect;
export type NewRawOcrResult = typeof rawOcrResults.$inferInsert;
