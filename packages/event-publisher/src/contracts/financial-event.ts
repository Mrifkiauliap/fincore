/**
 * Re-export FinancialEvent types dari @fincore/contracts.
 *
 * Contracts package adalah sumber kebenaran tunggal untuk semua types.
 * File ini hanya bridge agar import internal tetap bisa pakai path relatif.
 */
export type {
  DeliveryResult,
  FinancialEvent,
  FinancialEventType,
  WebhookSubscriptionContract,
} from "@fincore/contracts";

export {
  FINANCIAL_EVENT_TYPES,
  SCHEMA_VERSION,
} from "./financial-event.constants";
