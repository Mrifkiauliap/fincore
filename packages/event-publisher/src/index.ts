// ─── Core services ────────────────────────────────────────────────────────────
export { EventPublisher } from "./event-publisher.service";
export { WebhookRegistryService } from "./webhook-registry.service";

// ─── Transports ───────────────────────────────────────────────────────────────
export { WebhookTransport } from "./transports/webhook.transport";
export { NoopTransport } from "./transports/noop.transport";

// ─── Contracts & constants ────────────────────────────────────────────────────
export {
  FINANCIAL_EVENT_TYPES,
  SCHEMA_VERSION,
  FinancialEventSchema,
} from "./contracts/financial-event.constants";

// ─── Types (re-exported from @fincore/contracts) ──────────────────────────────
export type {
  FinancialEvent,
  FinancialEventType,
  WebhookSubscriptionContract,
  DeliveryResult,
} from "@fincore/contracts";
