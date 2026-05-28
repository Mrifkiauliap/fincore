import type { DeliveryResult, FinancialEvent } from "@fincore/contracts";
import { createLogger } from "@fincore/logger";

const logger = createLogger("event-publisher:noop");

/**
 * NoopTransport — used when there are no active subscribers.
 *
 * Events are logged but NOT delivered anywhere.
 * `is_published` stays FALSE so they can be replayed via catch-up job
 * once subscribers are registered.
 */
export class NoopTransport {
  async deliver(event: FinancialEvent): Promise<DeliveryResult> {
    logger.debug(
      { eventId: event.eventId, eventType: event.eventType },
      "No active subscribers — event not published (will catch up later)",
    );

    return {
      subscriptionId: "noop",
      subscriptionName: "noop",
      success: false, // false = is_published stays FALSE for future catch-up
      durationMs: 0,
      attempt: 1,
    };
  }
}
