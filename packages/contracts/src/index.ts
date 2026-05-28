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
  from: z.string(), // WhatsApp number
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
  transactionDate: z.string().optional(), // ISO date string
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
  content: z.string(), // text or transcription or OCR result
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

// ─── AI Multi-Extraction Output (for single or multi-transaction messages) ────
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

// ─── Financial Event (Event Publishing) ──────────────────────────────────────

export type FinancialEventType =
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted";

/**
 * Kontrak event yang dikirimkan FinCore ke external consumers (Finance Core, dll).
 *
 * - `eventId` = `transactions.event_id` - public stable ID, bukan internal PK.
 *   Consumers harus simpan ini untuk idempotency check.
 * - `schemaVersion` di-bump jika ada breaking change di payload.
 */
export interface FinancialEvent {
  /** = transactions.event_id. Public stable ID untuk idempotency. */
  eventId: string;
  eventType: FinancialEventType;
  /** ISO 8601 timestamp kapan transaksi terjadi. */
  occurredAt: string;
  schemaVersion: "1.0";
  source: {
    system: "fincore";
    userId: string;
    rawMessageId: string | null;
    ingestionMethod: "text" | "voice" | "image" | "document" | "video";
    confidenceScore: number;
    isAiGenerated: true;
  };
  payload: {
    transactionId: string;
    type: "expense" | "income" | "transfer";
    amount: number;
    fee: number;
    totalAmount: number;
    currency: string;
    categorySlug: string | null;
    merchant: string | null;
    location: string | null;
    paymentMethod: string | null;
    toPaymentMethod: string | null;
    transactionDate: string;
    notes: string | null;
    name: string | null;
  };
}

// ─── Webhook Subscription Contract ───────────────────────────────────────────

/**
 * Runtime representasi satu webhook subscriber.
 * Ini adalah view dari tabel `webhook_subscriptions` yang digunakan
 * oleh EventPublisher dan WebhookRegistryService.
 */
export interface WebhookSubscriptionContract {
  id: string;
  name: string;
  url: string;
  secret: string;
  /** ['*'] = subscribe semua events */
  eventTypes: FinancialEventType[] | ["*"];
  isActive: boolean;
  timeoutMs: number;
  maxRetries: number;
  createdAt: Date;
  lastTriggeredAt: Date | null;
  lastResponseStatus: number | null;
}

/**
 * Hasil delivery ke satu subscriber untuk satu event.
 */
export interface DeliveryResult {
  subscriptionId: string;
  subscriptionName: string;
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  attempt: number;
}
