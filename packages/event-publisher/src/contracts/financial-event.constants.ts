import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────
export const FINANCIAL_EVENT_TYPES = [
  "transaction.created",
  "transaction.updated",
  "transaction.deleted",
] as const;

export const SCHEMA_VERSION = "1.0" as const;

// ─── Zod Schema (untuk runtime validation) ───────────────────────────────────
// Dipakai di webhook.transport.ts untuk validate event sebelum dikirim,
// dan oleh consumers untuk validate payload yang diterima.
export const FinancialEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(FINANCIAL_EVENT_TYPES),
  occurredAt: z.string().datetime(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({
    system: z.literal("fincore"),
    userId: z.string().uuid(),
    rawMessageId: z.string().uuid().nullable(),
    ingestionMethod: z.enum(["text", "voice", "image", "document", "video"]),
    confidenceScore: z.number().min(0).max(1),
    isAiGenerated: z.literal(true),
  }),
  payload: z.object({
    transactionId: z.string().uuid(),
    type: z.enum(["expense", "income", "transfer"]),
    amount: z.number().positive(),
    fee: z.number().min(0).default(0),
    totalAmount: z.number().positive(),
    currency: z.string().default("IDR"),
    categorySlug: z.string().nullable(),
    merchant: z.string().nullable(),
    location: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    toPaymentMethod: z.string().nullable(),
    transactionDate: z.string().datetime(),
    notes: z.string().nullable(),
    name: z.string().nullable(),
  }),
});
