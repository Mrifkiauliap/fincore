import {
  getDb,
  rawMessages,
  transactions,
  transactionTagMappings,
} from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import { eq } from "drizzle-orm";
import { getExtractionErrorReply } from "./ai-confirmation";

const logger = createLogger("processor:ai-saver");

/**
 * Handle AI extraction failure: garbage-collect media, mark raw_message failed,
 * send error reply to user.
 */
export async function handleExtractionFailure(
  rawMessageId: string,
  error: string,
  chatId: string,
): Promise<void> {
  const db = getDb();
  const storageProvider = new StorageProvider();

  // 1. Check for stored media to clean up
  const [msg] = await db
    .select({ storagePath: rawMessages.storagePath })
    .from(rawMessages)
    .where(eq(rawMessages.id, rawMessageId))
    .limit(1);

  // 2. Delete media if exists (Garbage Collection)
  if (msg?.storagePath) {
    await storageProvider.deleteMedia(msg.storagePath);

    await db
      .update(rawMessages)
      .set({ storagePath: null })
      .where(eq(rawMessages.id, rawMessageId));

    logger.info(
      { rawMessageId, storagePath: msg.storagePath },
      "Garbage collected irrelevant media file",
    );
  }

  // 3. Mark failed
  await db
    .update(rawMessages)
    .set({
      processingStatus: "failed",
      processingError: error,
      processedAt: new Date(),
    })
    .where(eq(rawMessages.id, rawMessageId));

  // 4. Send reply
  await sendWaMessage(chatId, getExtractionErrorReply(), rawMessageId);
}

/**
 * Save a single extracted transaction to the database.
 * Returns the inserted transaction row.
 */
export async function saveTransaction(params: {
  userId: string;
  rawMessageId: string;
  name: string;
  categoryId: string | null;
  paymentMethodId: string | null;
  toPaymentMethodId: string | null;
  type: "expense" | "income" | "transfer";
  amount: number;
  fee: number;
  totalAmount: number;
  feeNote?: string | null;
  merchant?: string | null;
  location?: string | null;
  notes?: string | null;
  sourceType: string;
  confidenceScore: number;
  isConfirmed: boolean;
  transactionDate: Date;
  tagIds: string[];
}) {
  const db = getDb();

  const [transaction] = await db
    .insert(transactions)
    .values({
      userId: params.userId,
      rawMessageId: params.rawMessageId,
      name: params.name,
      categoryId: params.categoryId ?? undefined,
      paymentMethodId: (params.paymentMethodId as string | null) ?? undefined,
      toPaymentMethodId:
        (params.toPaymentMethodId as string | null | false) &&
        typeof params.toPaymentMethodId === "string"
          ? params.toPaymentMethodId
          : undefined,
      type: params.type,
      amount: String(params.amount),
      fee: String(params.fee),
      totalAmount: String(params.totalAmount),
      feeNote: params.feeNote ?? undefined,
      merchant: params.merchant ?? undefined,
      location: params.location ?? undefined,
      notes: params.notes ?? undefined,
      sourceType: params.sourceType as any,
      confidenceScore: params.confidenceScore,
      isConfirmed: params.isConfirmed,
      transactionDate: params.transactionDate,
    })
    .returning();

  // Insert tag mappings
  if (params.tagIds.length > 0) {
    await db.insert(transactionTagMappings).values(
      params.tagIds.map((tagId) => ({
        transactionId: transaction.id,
        tagId,
      })),
    );
  }

  return transaction;
}

/**
 * Enqueue post-save side effects: event publishing and budget check.
 */
export async function enqueuePostSave(
  transactionId: string,
  type: string,
  categoryId: string | null,
  userId: string,
  totalAmount: number,
): Promise<void> {
  // Queue for event publishing
  await enqueue(QueueName.EVENT_PUBLISHING, JobName.PUBLISH_FINANCIAL_EVENT, {
    transactionId,
    eventType: "transaction.created",
  });

  // Queue for budget check if expense
  if (type === "expense" && categoryId) {
    await enqueue(QueueName.BUDGET_CHECK, JobName.CHECK_BUDGET, {
      userId,
      categoryId,
      transactionId,
      amount: totalAmount,
    });
  }
}
