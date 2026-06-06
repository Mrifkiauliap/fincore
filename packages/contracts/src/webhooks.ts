import type { FinancialEventType } from "./events";

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
