import {
  MessageType,
  ProcessingStatus,
  TransactionType,
} from "@fincore/shared";
import { z } from "zod";

// ─── Incoming Message Event ───────────────────────────────────────────────────
export const IncomingMessageEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  from: z.string(),
  type: z.nativeEnum(MessageType),
  body: z.string().optional(),
  mediaUrl: z.string().optional(),
  mimetype: z.string().optional(),
  timestamp: z.number(),
  rawPayload: z.record(z.unknown()),
});
export type IncomingMessageEvent = z.infer<typeof IncomingMessageEventSchema>;

// ─── Voice Transcribed Event ──────────────────────────────────────────────────
export const VoiceTranscribedEventSchema = z.object({
  rawMessageId: z.string(),
  transcript: z.string(),
  language: z.string().default("id"),
  durationSeconds: z.number().optional(),
  provider: z.string(),
});
export type VoiceTranscribedEvent = z.infer<typeof VoiceTranscribedEventSchema>;

// ─── OCR Completed Event ──────────────────────────────────────────────────────
export const OcrCompletedEventSchema = z.object({
  rawMessageId: z.string(),
  extractedText: z.string(),
  provider: z.string(),
  confidence: z.number().optional(),
});
export type OcrCompletedEvent = z.infer<typeof OcrCompletedEventSchema>;

// ─── Transaction Extracted Event ─────────────────────────────────────────────
export const TransactionExtractedEventSchema = z.object({
  rawMessageId: z.string(),
  userId: z.string(),
  name: z.string(),
  type: z.nativeEnum(TransactionType),
  amount: z.number(),
  currency: z.string().default("IDR"),
  category: z.string(),
  merchant: z.string().optional(),
  location: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  sourceType: z.nativeEnum(MessageType),
  confidenceScore: z.number().min(0).max(1),
  transactionDate: z.string().optional(),
});
export type TransactionExtractedEvent = z.infer<
  typeof TransactionExtractedEventSchema
>;

// ─── Send WA Message Job ──────────────────────────────────────────────────────
export const SendWaMessageJobSchema = z.object({
  to: z.string(),
  message: z.string(),
  sessionId: z.string().default("default"),
  replyToMessageId: z.string().optional(),
});
export type SendWaMessageJob = z.infer<typeof SendWaMessageJobSchema>;

// ─── AI Extraction Input ──────────────────────────────────────────────────────
export const AiExtractionInputSchema = z.object({
  rawMessageId: z.string(),
  userId: z.string(),
  sourceType: z.nativeEnum(MessageType),
  content: z.string(),
});
export type AiExtractionInput = z.infer<typeof AiExtractionInputSchema>;

// ─── AI Extraction Output (expected JSON from AI) ────────────────────────────
export const AiExtractionOutputSchema = z
  .object({
    type: z.nativeEnum(TransactionType),
    name: z.string().default("Transaksi"),
    amount: z.number().positive(),
    fee: z
      .number()
      .nullable()
      .optional()
      .transform((v) => v ?? 0),
    total_amount: z.number().nullable().optional(),
    currency: z.string().default("IDR"),
    category: z.string(),
    merchant: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    payment_method: z.string().nullable().optional(),
    to_payment_method: z.string().nullable().optional(),
    fee_note: z.string().nullable().optional(),
    source_type: z.string(),
    notes: z.string().nullable().optional(),
    transaction_date: z.string().nullable().optional(),
    confidence_score: z.number().min(0).max(1),
  })
  .transform((data) => ({
    ...data,
    total_amount: data.total_amount ?? data.amount + data.fee,
  }))
  .refine((data) => data.total_amount === data.amount + data.fee, {
    message: "total_amount harus sama dengan amount + fee",
    path: ["total_amount"],
  })
  .refine(
    (data) =>
      data.type !== TransactionType.TRANSFER || !!data.to_payment_method,
    {
      message: "to_payment_method wajib diisi untuk type transfer",
      path: ["to_payment_method"],
    },
  );
export type AiExtractionOutput = z.infer<typeof AiExtractionOutputSchema>;

// ─── AI Multi-Extraction Output ───────────────────────────────────────────────
export const AiMultiExtractionOutputSchema = z.object({
  transactions: z.array(AiExtractionOutputSchema),
  overall_confidence: z.number().min(0).max(1),
});
export type AiMultiExtractionOutput = z.infer<
  typeof AiMultiExtractionOutputSchema
>;

// ─── Processing Status Update ─────────────────────────────────────────────────
export const ProcessingStatusUpdateSchema = z.object({
  rawMessageId: z.string(),
  status: z.nativeEnum(ProcessingStatus),
  error: z.string().optional(),
});
export type ProcessingStatusUpdate = z.infer<
  typeof ProcessingStatusUpdateSchema
>;
