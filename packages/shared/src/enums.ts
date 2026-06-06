// ─── Message Types ────────────────────────────────────────────────────────────
export enum MessageType {
  TEXT = "text",
  VOICE = "voice",
  IMAGE = "image",
  DOCUMENT = "document",
  VIDEO = "video",
}

// ─── Transaction Types ────────────────────────────────────────────────────────
export enum TransactionType {
  EXPENSE = "expense",
  INCOME = "income",
  TRANSFER = "transfer",
}

// ─── Processing Status ────────────────────────────────────────────────────────
export enum ProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  DONE = "done",
  FAILED = "failed",
  SKIPPED = "skipped",
}
