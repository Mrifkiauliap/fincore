import type {
  DeliveryResult,
  FinancialEvent,
  FinancialEventType,
} from "@fincore/contracts";
import { createLogger } from "@fincore/logger";
import { WebhookTransport } from "./transports/webhook.transport";
import { WebhookRegistryService } from "./webhook-registry.service";

const logger = createLogger("event-publisher");

/**
 * EventPublisher — multi-delivery orchestrator.
 *
 * Inspired by GitHub/Stripe/Clerk webhook model:
 * - ONE event can be delivered to MULTIPLE subscribers in parallel
 * - Each subscriber delivery is independent (one failure does NOT block others)
 * - Results are logged per-subscriber for observability
 *
 * Usage:
 *   const publisher = new EventPublisher(registry);
 *   const results = await publisher.publish(financialEvent);
 *
 * Flow:
 *   Transaction saved (is_published = false)
 *     → Enqueue: event-publishing job
 *     → EventPublisher.publish(event)
 *     → WebhookRegistryService.getActiveSubscribers(eventType)
 *     → deliver to ALL subscribers in parallel (Promise.allSettled)
 *     → if ANY subscriber succeeds: mark is_published = true
 *     → log all results to webhook_delivery_logs
 */
export class EventPublisher {
  constructor(private readonly registry: WebhookRegistryService) {}

  /**
   * Publish a FinancialEvent to all active subscribers.
   *
   * Returns an array of DeliveryResult — one per subscriber.
   * Returns empty array if no active subscribers (event stays unpublished).
   */
  async publish(event: FinancialEvent): Promise<DeliveryResult[]> {
    const subscribers = await this.registry.getActiveSubscribers(
      event.eventType as FinancialEventType,
    );

    if (subscribers.length === 0) {
      logger.debug(
        { eventId: event.eventId, eventType: event.eventType },
        "No active subscribers — event stays unpublished (catch-up will handle it)",
      );
      return [];
    }

    logger.info(
      {
        eventId: event.eventId,
        eventType: event.eventType,
        subscriberCount: subscribers.length,
        subscribers: subscribers.map((s) => s.name),
      },
      "Publishing event to subscribers",
    );

    // Deliver to ALL subscribers in parallel — each is independent
    const settled = await Promise.allSettled(
      subscribers.map((sub) => {
        const transport = new WebhookTransport(sub);
        return transport.deliver(event);
      }),
    );

    // Normalize results
    const results: DeliveryResult[] = settled.map((r, i) => {
      if (r.status === "fulfilled") return r.value;

      // Should rarely happen — WebhookTransport catches internally
      return {
        subscriptionId: subscribers[i]!.id,
        subscriptionName: subscribers[i]!.name,
        success: false,
        durationMs: 0,
        error: String(r.reason),
        attempt: 1,
      };
    });

    const successCount = results.filter((r) => r.success).length;
    logger.info(
      {
        eventId: event.eventId,
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
      },
      "Event publishing complete",
    );

    return results;
  }

  /**
   * Catch-up: re-publish a batch of unpublished events.
   * Used by a scheduled job to replay events that had no subscribers at the time.
   *
   * @returns Map of eventId → delivery results
   */
  async catchUp(
    events: FinancialEvent[],
  ): Promise<Map<string, DeliveryResult[]>> {
    const resultMap = new Map<string, DeliveryResult[]>();

    for (const event of events) {
      const results = await this.publish(event);
      resultMap.set(event.eventId, results);
    }

    return resultMap;
  }

  /**
   * Check if there are any active subscribers registered.
   * Useful for skip-early logic in processors.
   */
  async hasActiveSubscribers(eventType: FinancialEventType): Promise<boolean> {
    const subscribers = await this.registry.getActiveSubscribers(eventType);
    return subscribers.length > 0;
  }
}
