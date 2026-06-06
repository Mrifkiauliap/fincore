// ─── Financial Event Types ──────────────────────────────────────────────────

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
