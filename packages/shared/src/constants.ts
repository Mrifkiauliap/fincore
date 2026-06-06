// ─── Currency Codes ────────────────────────────────────────────────────────────
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
