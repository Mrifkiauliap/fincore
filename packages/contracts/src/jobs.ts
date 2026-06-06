// ─── Shared Job Data Contracts ────────────────────────────────────────────────

/**
 * Common shape for all command-style jobs (transaction, custom, budget, settings).
 * Both the API (webhook.service.ts) and Worker (processors) use this contract.
 */
export interface CommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

/**
 * Budget check job — triggered after a transaction is created to evaluate
 * budget thresholds.
 */
export interface BudgetCheckJobData {
  userId: string;
  categoryId: string;
  transactionId: string;
  amount: number;
}

/**
 * State persisted in Valkey while waiting for a user reply
 * (multi-turn confirmation flow).
 */
export interface PendingActionState {
  action: "confirm_delete" | "select_candidate" | "ubah_select" | "ubah_input";
  transactionIds: string[];
  /** Deskripsi singkat untuk ditampilkan ke user */
  description?: string;
  /** Untuk ubah_input: ID transaksi yang dipilih */
  selectedId?: string;
}

/**
 * Incoming message job data — enqueued by webhook.service.ts for processing.
 */
export interface IncomingMessageJobData {
  waMessageId: string;
  from: string;
  senderPhone: string;
  type: string;
  body: string;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaSize: number | null;
  rawPayload: unknown;
  timestamp: number;
  session: string;
  skipProcessing: boolean;
}
