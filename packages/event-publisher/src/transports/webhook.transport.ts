import type {
  DeliveryResult,
  FinancialEvent,
  WebhookSubscriptionContract,
} from "@fincore/contracts";
import { createLogger } from "@fincore/logger";
import { createHmac } from "crypto";

const logger = createLogger("event-publisher:webhook");

/**
 * WebhookTransport - delivers a FinancialEvent to ONE specific subscriber.
 *
 * Features:
 * - HMAC-SHA256 signature on every request (`X-FinCore-Signature: sha256=<hmac>`)
 * - Configurable timeout per subscriber
 * - Per-attempt result returned for logging in webhook_delivery_logs
 *
 * Instantiated per-subscriber by EventPublisher.
 * Do NOT use FINANCE_CORE_WEBHOOK_URL env var directly - that is legacy.
 * Subscriber config comes from WebhookSubscriptionContract (from DB).
 */
export class WebhookTransport {
  constructor(private readonly subscription: WebhookSubscriptionContract) {}

  async deliver(event: FinancialEvent, attempt = 1): Promise<DeliveryResult> {
    const start = Date.now();
    const body = JSON.stringify(event);
    const signature = this.sign(body, this.subscription.secret);

    try {
      const response = await this.fetchWithTimeout(body, signature, event);

      const durationMs = Date.now() - start;
      logger.info(
        {
          eventId: event.eventId,
          eventType: event.eventType,
          subscriber: this.subscription.name,
          statusCode: response.status,
          durationMs,
        },
        "Event delivered to subscriber",
      );

      return {
        subscriptionId: this.subscription.id,
        subscriptionName: this.subscription.name,
        success: response.ok,
        statusCode: response.status,
        durationMs,
        attempt,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : "Unknown error";

      logger.error(
        {
          eventId: event.eventId,
          subscriber: this.subscription.name,
          error,
          durationMs,
        },
        "Webhook delivery failed",
      );

      return {
        subscriptionId: this.subscription.id,
        subscriptionName: this.subscription.name,
        success: false,
        durationMs,
        error,
        attempt,
      };
    }
  }

  private async fetchWithTimeout(
    body: string,
    signature: string,
    event: FinancialEvent,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.subscription.timeoutMs,
    );

    try {
      return await fetch(this.subscription.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FinCore-Signature": `sha256=${signature}`,
          "X-FinCore-Event": event.eventType,
          "X-FinCore-Event-Id": event.eventId,
          "X-FinCore-Schema-Version": event.schemaVersion,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * HMAC-SHA256 signature dari body payload.
   * Consumer verify dengan: `sha256=<hmac>` di header `X-FinCore-Signature`.
   * Jika hashedSecret kosong (seharusnya tidak), return empty string.
   */
  private sign(body: string, hashedSecret: string): string {
    if (!hashedSecret) return "";
    return createHmac("sha256", hashedSecret).update(body).digest("hex");
  }
}
