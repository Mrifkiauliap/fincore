import { BaseProcessor } from "@/processors/base.processor";
import type { FinancialEvent, FinancialEventType } from "@fincore/contracts";
import { getDb, trackEvent, transactions } from "@fincore/db";
import {
  EventPublisher,
  WebhookRegistryService,
} from "@fincore/event-publisher";
import { QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { eq } from "drizzle-orm";

export interface PublishFinancialEventData {
  transactionId: string;
  eventType: FinancialEventType;
}

@Injectable()
export class EventPublishingProcessor extends BaseProcessor {
  readonly queueName = QueueName.EVENT_PUBLISHING;
  private readonly publisher: EventPublisher;

  constructor() {
    super("event-publishing.processor");
    const registry = new WebhookRegistryService();
    this.publisher = new EventPublisher(registry);
  }

  async process(job: Job<PublishFinancialEventData>): Promise<void> {
    const { transactionId, eventType } = job.data;
    this.logger.info(
      `Processing event publishing for transaction ${transactionId} (${eventType})`,
    );

    const db = getDb();

    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
      with: {
        user: true,
        rawMessage: true,
        category: true,
        paymentMethod: true,
        toPaymentMethod: true,
      },
    });

    if (!tx) {
      this.logger.warn(
        `Transaction ${transactionId} not found, skipping event publishing`,
      );
      return;
    }

    if (!tx.user) {
      this.logger.warn(
        `Transaction ${transactionId} has no associated user, skipping`,
      );
      return;
    }

    const financialEvent: FinancialEvent = {
      eventId: tx.eventId,
      eventType,
      occurredAt: new Date().toISOString(),
      schemaVersion: "1.0",
      source: {
        system: "fincore",
        userId: tx.userId,
        rawMessageId: tx.rawMessageId,
        ingestionMethod: tx.sourceType,
        confidenceScore: tx.confidenceScore ?? 1,
        isAiGenerated: true,
      },
      payload: {
        transactionId: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        fee: Number(tx.fee),
        totalAmount: Number(tx.totalAmount),
        currency: "IDR",
        categorySlug: tx.category?.slug ?? null,
        merchant: tx.merchant,
        location: tx.location,
        paymentMethod: tx.paymentMethod?.name ?? null,
        toPaymentMethod: tx.toPaymentMethod?.name ?? null,
        transactionDate: tx.transactionDate.toISOString(),
        notes: tx.notes,
        name: tx.name,
      },
    };

    const results = await this.publisher.publish(financialEvent);
    const subscriberCount = results.length;
    const isSuccess = results.some((r) => r.success);

    if (isSuccess) {
      await db
        .update(transactions)
        .set({ isPublished: true, publishedAt: new Date() })
        .where(eq(transactions.id, transactionId));

      this.logger.info(`Successfully published event ${tx.eventId}`);
    } else {
      if (results.length === 0) {
        this.logger.info(
          `No active subscribers for event ${tx.eventId}, stays unpublished for catch-up`,
        );
      } else {
        trackEvent({
          category: "queue",
          event: "event.publish.failed",
          metadata: { subscriberCount },
        }).catch(() => {});

        this.logger.error(
          `Failed to publish event ${tx.eventId} to all subscribers`,
        );
      }
    }
  }
}
