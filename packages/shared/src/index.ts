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

export enum TransactionCategory {
  FOOD = "Food",
  TRANSPORT = "Transport",
  SHOPPING = "Shopping",
  HEALTH = "Health",
  ENTERTAINMENT = "Entertainment",
  BILLS = "Bills",
  EDUCATION = "Education",
  INVESTMENT = "Investment",
  SALARY = "Salary",
  OTHER = "Other",
}

export enum PaymentMethod {
  CASH = "Cash",
  GOPAY = "GoPay",
  OVO = "OVO",
  DANA = "Dana",
  QRIS = "QRIS",
  SHOPEE_PAY = "ShopeePay",
  BANK_TRANSFER = "Bank Transfer",
  CREDIT_CARD = "Credit Card",
  DEBIT_CARD = "Debit Card",
  OTHER = "Other",
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
} as const;

// ─── Constants ────────────────────────────────────────────────────────────────
export const CURRENCY = {
  IDR: "IDR",
} as const;

export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;

// ─── Confirmation TTL ─────────────────────────────────────────────────────────
export const PENDING_CONFIRMATION_TTL_SECONDS = 15 * 60; // 15 menit
