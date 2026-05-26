import { z } from 'zod';
import { MessageType, TransactionType, ProcessingStatus } from '@fincore/shared';

// ─── Incoming Message Event ───────────────────────────────────────────────────
export const IncomingMessageEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  from: z.string(),           // WhatsApp number
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
  language: z.string().default('id'),
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
  type: z.nativeEnum(TransactionType),
  amount: z.number(),
  currency: z.string().default('IDR'),
  category: z.string(),
  merchant: z.string().optional(),
  location: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  sourceType: z.nativeEnum(MessageType),
  confidenceScore: z.number().min(0).max(1),
  transactionDate: z.string().optional(), // ISO date string
});
export type TransactionExtractedEvent = z.infer<typeof TransactionExtractedEventSchema>;

// ─── Send WA Message Job ──────────────────────────────────────────────────────
export const SendWaMessageJobSchema = z.object({
  to: z.string(),
  message: z.string(),
  sessionId: z.string().default('default'),
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
    amount: z.number().positive(),
    /** Biaya admin / transfer fee. Default 0 jika tidak disebutkan user. */
    fee: z.number().min(0).default(0),
    /**
     * amount + fee. AI harus menghitung ini.
     * Jika fee tidak ada, total_amount = amount.
     */
    total_amount: z.number().min(0),
    currency: z.string().default('IDR'),
    category: z.string(),
    merchant: z.string().optional(),
    location: z.string().optional(),
    payment_method: z.string().optional(),
    /**
     * Nama metode tujuan untuk transfer (contoh: "Bank Jago", "OVO").
     * Null/undefined untuk expense dan income.
     */
    to_payment_method: z.string().optional(),
    /** Keterangan biaya tambahan, contoh: "biaya transfer beda bank". */
    fee_note: z.string().optional(),
    source_type: z.string(),
    notes: z.string().optional(),
    confidence_score: z.number().min(0).max(1),
  })
  .refine((data) => data.total_amount === data.amount + data.fee, {
    message: 'total_amount harus sama dengan amount + fee',
    path: ['total_amount'],
  })
  .refine((data) => data.type !== TransactionType.TRANSFER || !!data.to_payment_method, {
    message: 'to_payment_method wajib diisi untuk type transfer',
    path: ['to_payment_method'],
  });
export type AiExtractionOutput = z.infer<typeof AiExtractionOutputSchema>;

// ─── Processing Status Update ─────────────────────────────────────────────────
export const ProcessingStatusUpdateSchema = z.object({
  rawMessageId: z.string(),
  status: z.nativeEnum(ProcessingStatus),
  error: z.string().optional(),
});
export type ProcessingStatusUpdate = z.infer<typeof ProcessingStatusUpdateSchema>;
