import { computeAiCost } from "@/lib/ai-cost";
import { BaseProcessor } from "@/processors/base.processor";
import { SumopodProvider } from "@fincore/ai";
import getConfig from "@fincore/config";
import { AiExtractionOutput } from "@fincore/contracts";
import {
  aiProcessingLogs,
  getDb,
  paymentMethods,
  rawAiOutputs,
  rawMessages,
  trackEvent,
  transactionCategories,
  transactionTags,
} from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import {
  MessageType,
  PENDING_CONFIRMATION_TTL_SECONDS,
  QueueName,
} from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, isNull, or } from "drizzle-orm";
import { buildReply, buildTransactionSummaryLine } from "./ai-confirmation";
import {
  resolveCategory,
  resolvePaymentMethod,
  resolveTags,
} from "./ai-resolvers";
import {
  enqueuePostSave,
  handleExtractionFailure,
  saveTransaction,
} from "./ai-saver";

dayjs.extend(utc);
dayjs.extend(timezone);

interface AiExtractionJobData {
  rawMessageId: string;
  userId: string;
  from: string;
  sourceType: MessageType;
  content: string;
}

const CONFIDENCE_MIN = 0.4;
const CONFIDENCE_AUTO = 0.7;

const logger = createLogger("processor:ai-extraction");
const pendingConfirmKey = (chatId: string) =>
  `fincore:pending_confirm:${chatId}`;

@Injectable()
export class AiExtractionProcessor extends BaseProcessor {
  readonly queueName = QueueName.AI_EXTRACTION;
  private readonly ai = new SumopodProvider();

  constructor() {
    super("processor:ai-extraction");
  }

  async process(job: Job<AiExtractionJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();
    const start = Date.now();

    logger.info(
      { rawMessageId: data.rawMessageId, userId: data.userId },
      "Starting AI extraction",
    );

    // ── 0. Idempotency guard ──────────────────────────────────────────────────
    const [existingMsg] = await db
      .select({ status: rawMessages.processingStatus })
      .from(rawMessages)
      .where(eq(rawMessages.id, data.rawMessageId))
      .limit(1);

    if (
      existingMsg &&
      (existingMsg.status === "done" ||
        existingMsg.status === "pending_confirmation")
    ) {
      logger.warn(
        { rawMessageId: data.rawMessageId, status: existingMsg.status },
        "rawMessage already processed, skipping duplicate AI extraction",
      );
      return;
    }

    // ── 1. Fetch Dynamic Context ──────────────────────────────────────────────
    const allCategories = await db
      .select({
        slug: transactionCategories.slug,
        type: transactionCategories.type,
      })
      .from(transactionCategories)
      .where(
        and(
          eq(transactionCategories.isActive, true),
          or(
            isNull(transactionCategories.userId),
            eq(transactionCategories.userId, data.userId),
          ),
        ),
      );

    const allPaymentMethods = await db
      .select({ name: paymentMethods.name })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.isActive, true),
          or(
            isNull(paymentMethods.userId),
            eq(paymentMethods.userId, data.userId),
          ),
        ),
      );

    const userTags = await db
      .select({ name: transactionTags.name })
      .from(transactionTags)
      .where(eq(transactionTags.userId, data.userId))
      .limit(30);

    const context = {
      categories: {
        expense: allCategories
          .filter((c) => c.type === "expense")
          .map((c) => c.slug),
        income: allCategories
          .filter((c) => c.type === "income")
          .map((c) => c.slug),
        transfer: allCategories
          .filter((c) => c.type === "transfer")
          .map((c) => c.slug),
      },
      paymentMethods: allPaymentMethods.map((p) => p.name),
      tags: userTags.map((t) => t.name),
    };

    // ── 2. Extract via AI ────────────────────────────────────────────────────
    let extractedList: AiExtractionOutput[];
    let rawResponse = "";
    let aiLatencyMs = 0;
    let aiUsage: { inputTokens: number; outputTokens: number } | undefined;

    try {
      const aiStart = Date.now();
      const aiResult = await this.ai.extractTransaction(data.content, context);
      aiLatencyMs = Date.now() - aiStart;

      extractedList = aiResult.parsed;
      rawResponse = aiResult.raw;
      aiUsage = aiResult.usage;

      const durationMs = Date.now() - start;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ai_extraction",
        status: "done",
        provider: "sumopod",
        durationMs,
        inputSnapshot: { content: data.content },
        outputSnapshot: { extracted: extractedList as any },
      });

      const model = getConfig("AI_EXTRACTION_MODEL");
      const inputTokens = aiUsage?.inputTokens ?? 0;
      const outputTokens = aiUsage?.outputTokens ?? 0;

      trackEvent({
        category: "ai",
        event: "ai.extraction.completed",
        metadata: {
          userId: data.userId,
          latencyMs: aiLatencyMs,
          model,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost: computeAiCost(inputTokens, outputTokens, model),
        },
      }).catch(() => {});
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await db.insert(aiProcessingLogs).values({
        rawMessageId: data.rawMessageId,
        step: "ai_extraction",
        status: "failed",
        provider: "sumopod",
        durationMs,
        inputSnapshot: { content: data.content },
        error: err?.message || String(err),
      });

      trackEvent({
        category: "ai",
        event: "ai.extraction.failed",
        metadata: {
          userId: data.userId,
          error: err?.message || String(err),
          latencyMs: durationMs,
          model: getConfig("AI_EXTRACTION_MODEL"),
        },
      }).catch(() => {});

      await handleExtractionFailure(
        data.rawMessageId,
        `AI extraction error: ${(err as Error).message}`,
        data.from,
      );
      return;
    }

    // ── 3. Global confidence check ────────────────────────────────────────────
    if (extractedList.length === 0) {
      logger.info("No transactions detected in message");
      await handleExtractionFailure(
        data.rawMessageId,
        "No transactions detected",
        data.from,
      );
      return;
    }

    const anyAboveMin = extractedList.some(
      (e) => e.confidence_score >= CONFIDENCE_MIN,
    );
    if (!anyAboveMin) {
      logger.info("All transactions below confidence threshold");
      await handleExtractionFailure(
        data.rawMessageId,
        `Low confidence: ${extractedList.map((e) => e.confidence_score).join(", ")}`,
        data.from,
      );
      return;
    }

    // ── 4. Save raw_ai_output (audit log) ─────────────────────────────────────
    await db.insert(rawAiOutputs).values({
      rawMessageId: data.rawMessageId,
      prompt: data.content,
      response: rawResponse,
      parsedOutput: extractedList as any,
      provider: "sumopod",
      model: getConfig("AI_EXTRACTION_MODEL"),
      inputTokens: aiUsage?.inputTokens,
      outputTokens: aiUsage?.outputTokens,
      latencyMs: aiLatencyMs,
      isValid: true,
    });

    // ── 5. Process each transaction ───────────────────────────────────────────
    const savedIds: string[] = [];
    const pendingIds: string[] = [];
    const savedSummaries: string[] = [];
    const pendingSummaries: string[] = [];
    const pendingReasons: (
      | "low_confidence"
      | "suspicious_amount"
      | "missing_payment_method"
    )[] = [];

    for (const extracted of extractedList) {
      if (extracted.confidence_score < CONFIDENCE_MIN) {
        logger.info(
          { confidence: extracted.confidence_score },
          "Skipping low-confidence item in multi-transaction",
        );
        continue;
      }

      // ── 5a. Resolve category ───────────────────────────────────────────────
      const categoryId = await resolveCategory(
        extracted.category,
        extracted.type,
        data.userId,
      );

      // ── 5b. Resolve payment method ─────────────────────────────────────────
      const paymentMethodId = extracted.payment_method
        ? await resolvePaymentMethod(extracted.payment_method, data.userId)
        : null;

      const toPaymentMethodId =
        extracted.type === "transfer" && extracted.to_payment_method
          ? await resolvePaymentMethod(extracted.to_payment_method, data.userId)
          : null;

      // ── 5c. Resolve tags ───────────────────────────────────────────────────
      const resolvedTagIds = await resolveTags(extracted.tags, data.userId);

      // ── 5d. Determine if needs confirmation ────────────────────────────────
      const isSuspiciouslySmallFromOcr =
        data.sourceType === MessageType.IMAGE && extracted.total_amount < 1000;
      const isMissingPaymentMethod = !paymentMethodId;

      const needsConfirmation =
        extracted.confidence_score < CONFIDENCE_AUTO ||
        isSuspiciouslySmallFromOcr ||
        isMissingPaymentMethod;

      const confirmationReason:
        | "low_confidence"
        | "suspicious_amount"
        | "missing_payment_method"
        | null = isSuspiciouslySmallFromOcr
        ? "suspicious_amount"
        : isMissingPaymentMethod
          ? "missing_payment_method"
          : needsConfirmation
            ? "low_confidence"
            : null;

      let transactionDate = dayjs().tz("Asia/Jakarta").toDate();
      if (extracted.transaction_date) {
        const parsedDate = new Date(extracted.transaction_date);
        if (!isNaN(parsedDate.getTime())) {
          transactionDate = parsedDate;
        }
      }

      const transaction = await saveTransaction({
        userId: data.userId,
        rawMessageId: data.rawMessageId,
        name: extracted.name ?? "Transaksi",
        categoryId,
        paymentMethodId: paymentMethodId as string | null,
        toPaymentMethodId: toPaymentMethodId as string | null,
        type: extracted.type as "expense" | "income" | "transfer",
        amount: extracted.amount,
        fee: extracted.fee,
        totalAmount: extracted.total_amount,
        feeNote: extracted.fee_note,
        merchant: extracted.merchant,
        location: extracted.location,
        notes: extracted.notes,
        sourceType: data.sourceType,
        confidenceScore: extracted.confidence_score,
        isConfirmed: !needsConfirmation,
        transactionDate,
        tagIds: resolvedTagIds,
      });

      logger.info(
        {
          transactionId: transaction.id,
          type: extracted.type,
          amount: extracted.amount,
          needsConfirmation,
          tagsCount: resolvedTagIds.length,
          latencyMs: Date.now() - start,
        },
        needsConfirmation ? "Transaction saved (pending)" : "Transaction saved",
      );

      const summaryLine = buildTransactionSummaryLine(extracted);

      if (needsConfirmation) {
        pendingIds.push(transaction.id);
        pendingSummaries.push(summaryLine);
        if (confirmationReason === "suspicious_amount") {
          pendingReasons.push("suspicious_amount");
        } else if (confirmationReason === "missing_payment_method") {
          pendingReasons.push("missing_payment_method");
        } else {
          pendingReasons.push("low_confidence");
        }
      } else {
        savedIds.push(transaction.id);
        savedSummaries.push(summaryLine);
        await enqueuePostSave(
          transaction.id,
          extracted.type,
          categoryId,
          data.userId,
          extracted.total_amount,
        );
      }
    }

    // ── 6. Update raw_message status ──────────────────────────────────────────
    const hasPending = pendingIds.length > 0;
    await db
      .update(rawMessages)
      .set({
        processingStatus: hasPending ? "pending_confirmation" : "done",
        processedAt: new Date(),
      })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 7. Store pending confirmation state in Valkey ─────────────────────────
    if (hasPending) {
      const { getSharedValkey } = await import("@fincore/queue");
      const valkey = getSharedValkey();
      const pendingPayload = JSON.stringify({
        transactionIds: pendingIds,
        rawMessageId: data.rawMessageId,
      });
      await valkey.set(
        pendingConfirmKey(data.from),
        pendingPayload,
        "EX",
        PENDING_CONFIRMATION_TTL_SECONDS,
      );
    }

    // ── 8. Send reply ─────────────────────────────────────────────────────────
    const replyText = buildReply(
      savedSummaries,
      pendingSummaries,
      savedIds.length,
      pendingIds.length,
      pendingReasons,
    );
    await sendWaMessage(data.from, replyText, data.rawMessageId);
  }
}
