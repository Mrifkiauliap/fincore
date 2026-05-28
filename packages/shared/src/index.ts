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

// ─── Job Names ────────────────────────────────────────────────────────────────
export const JobName = {
  PROCESS_INCOMING_MESSAGE: "process-incoming-message",
  TRANSCRIBE_VOICE: "transcribe-voice",
  OCR_IMAGE: "ocr-image",
  EXTRACT_TRANSACTION: "extract-transaction",
  CATEGORIZE_TRANSACTION: "categorize-transaction",
  GENERATE_REPORT: "generate-report",
  SEND_WA_MESSAGE: "send-wa-message",
  CONFIRM_TRANSACTION: "confirm-transaction",
  SETUP_RECURRING: "setup-recurring",
  SEND_RECURRING_REMINDER: "send-recurring-reminder",
  EXPIRE_PENDING_CONFIRMATIONS: "expire-pending-confirmations",
  PUBLISH_FINANCIAL_EVENT: "publish-financial-event",
  GENERATE_MONTHLY_REPORT: "generate-monthly-report",
  CHECK_BUDGET: "check-budget",
  PROCESS_BUDGET_COMMAND: "process-budget-command",
  PROCESS_TRANSACTION_COMMAND: "process-transaction-command",
  PROCESS_CUSTOM_COMMAND: "process-custom-command",
  PROCESS_SETTINGS_COMMAND: "process-settings-command",
} as const;

// ─── Queue Names ─────────────────────────────────────────────────────────────
export const QueueName = {
  INCOMING_MESSAGE: "incoming-message",
  VOICE_TRANSCRIPTION: "voice-transcription",
  IMAGE_OCR: "image-ocr",
  AI_EXTRACTION: "ai-extraction",
  CATEGORIZATION: "categorization",
  REPORT_GENERATION: "report-generation",
  WA_SENDER: "wa-sender",
  CONFIRMATION: "confirmation",
  RECURRING_SETUP: "recurring-setup",
  RECURRING_REMINDER: "recurring-reminder",
  EVENT_PUBLISHING: "event-publishing",
  MONTHLY_REPORT: "monthly-report",
  BUDGET_CHECK: "budget-check",
  BUDGET_COMMAND: "budget-command",
  TRANSACTION_COMMAND: "transaction-command",
  CUSTOM_COMMAND: "custom-command",
  SETTINGS_COMMAND: "settings-command",
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────
export const CURRENCY = {
  IDR: "IDR",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  JPY: "JPY",
  CNY: "CNY",
  KRW: "KRW",
  AUD: "AUD",
  CAD: "CAD",
  CHF: "CHF",
  BRL: "BRL",
  INR: "INR",
  MXN: "MXN",
  RUB: "RUB",
  TRY: "TRY",
  ZAR: "ZAR",
} as const;

export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;

// ─── Confirmation TTL ─────────────────────────────────────────────────────────
export const PENDING_CONFIRMATION_TTL_SECONDS = 15 * 60; // 15 menit
