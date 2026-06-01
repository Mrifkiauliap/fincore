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
  transactionCategories,
  transactions,
  transactionTagMappings,
  transactionTags,
} from "@fincore/db";
import { createValkeyConnection, enqueue, sendWaMessage } from "@fincore/queue";
import {
  JobName,
  MessageType,
  PENDING_CONFIRMATION_TTL_SECONDS,
  QueueName,
} from "@fincore/shared";
import { StorageProvider } from "@fincore/storage";
import {
  formatCurrency,
  getTransactionTypeLabel,
  toTitleCase,
} from "@fincore/utils";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import { and, eq, ilike, isNull, or } from "drizzle-orm";

interface AiExtractionJobData {
  rawMessageId: string;
  userId: string;
  from: string; // WhatsApp chatId
  sourceType: MessageType;
  content: string;
}

// Confidence thresholds
const CONFIDENCE_MIN = 0.4; // di bawah ini: tolak
const CONFIDENCE_AUTO = 0.7; // di atas ini: simpan langsung tanpa konfirmasi

// Redis key helper
const pendingConfirmKey = (chatId: string) =>
  `fincore:pending_confirm:${chatId}`;

@Injectable()
export class AiExtractionProcessor extends BaseProcessor {
  readonly queueName = QueueName.AI_EXTRACTION;
  private readonly ai = new SumopodProvider();
  private readonly storageProvider = new StorageProvider();
  private valkey: ReturnType<typeof createValkeyConnection>;

  constructor() {
    super("processor:ai-extraction");
    this.valkey = createValkeyConnection();
  }

  async process(job: Job<AiExtractionJobData>): Promise<void> {
    const data = job.data;
    const db = getDb();
    const start = Date.now();

    this.logger.info(
      { rawMessageId: data.rawMessageId, userId: data.userId },
      "Starting AI extraction",
    );

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

    // ── 2. Extract via AI (returns array) ─────────────────────────────────────
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

      await this.handleExtractionFailure(
        db,
        data.rawMessageId,
        `AI extraction error: ${(err as Error).message}`,
        data.from,
      );
      return;
    }

    // ── 2. Global confidence check (no transactions detected) ─────────────────
    if (extractedList.length === 0) {
      this.logger.info("No transactions detected in message");
      await this.handleExtractionFailure(
        db,
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
      this.logger.info("All transactions below confidence threshold");
      await this.handleExtractionFailure(
        db,
        data.rawMessageId,
        `Low confidence: ${extractedList.map((e) => e.confidence_score).join(", ")}`,
        data.from,
      );
      return;
    }

    // ── 3. Save raw_ai_output (audit log) ─────────────────────────────────────
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

    // ── 4. Process each transaction ───────────────────────────────────────────
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
        this.logger.info(
          { confidence: extracted.confidence_score },
          "Skipping low-confidence item in multi-transaction",
        );
        continue;
      }

      // ── 4a. Resolve category ───────────────────────────────────────────────
      const categoryId = await this.resolveCategory(
        db,
        extracted.category,
        extracted.type,
        data.userId,
      );

      // ── 4b. Resolve payment method ─────────────────────────────────────────
      const paymentMethodId = extracted.payment_method
        ? await this.resolvePaymentMethod(
            db,
            extracted.payment_method,
            data.userId,
          )
        : null;

      const toPaymentMethodId =
        extracted.type === "transfer" && extracted.to_payment_method
          ? await this.resolvePaymentMethod(
              db,
              extracted.to_payment_method,
              data.userId,
            )
          : null;

      // ── 4c. Resolve tags ───────────────────────────────────────────────────
      const resolvedTagIds = await this.resolveTags(
        db,
        extracted.tags,
        data.userId,
      );

      // ── 4d. Determine if needs confirmation ────────────────────────────────
      // Paksa konfirmasi jika nominal terlalu kecil dari sumber gambar (kemungkinan OCR salah baca ribuan)
      const isSuspiciouslySmallFromOcr =
        data.sourceType === MessageType.IMAGE && extracted.total_amount < 1000;

      // Paksa konfirmasi jika metode pembayaran tidak ada
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
      let transactionDate = new Date();
      if (extracted.transaction_date) {
        const parsedDate = new Date(extracted.transaction_date);
        if (!isNaN(parsedDate.getTime())) {
          transactionDate = parsedDate;
        }
      }

      const [transaction] = await db
        .insert(transactions)
        .values({
          userId: data.userId,
          rawMessageId: data.rawMessageId,
          name: extracted.name ?? "Transaksi",
          categoryId: categoryId ?? undefined,
          paymentMethodId: (paymentMethodId as string | null) ?? undefined,
          toPaymentMethodId:
            (toPaymentMethodId as string | null | false) &&
            typeof toPaymentMethodId === "string"
              ? toPaymentMethodId
              : undefined,
          type: extracted.type,
          amount: String(extracted.amount),
          fee: String(extracted.fee),
          totalAmount: String(extracted.total_amount),
          feeNote: extracted.fee_note ?? undefined,
          currency: extracted.currency,
          merchant: extracted.merchant ?? undefined,
          location: extracted.location ?? undefined,
          notes: extracted.notes ?? undefined,
          sourceType: data.sourceType,
          confidenceScore: extracted.confidence_score,
          isConfirmed: !needsConfirmation,
          transactionDate,
        })
        .returning();

      // ── 4e. Insert tag mappings ───────────────────────────────────────────
      if (resolvedTagIds.length > 0) {
        await db.insert(transactionTagMappings).values(
          resolvedTagIds.map((tagId) => ({
            transactionId: transaction.id,
            tagId,
          })),
        );
      }

      this.logger.info(
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

      const summaryLine = this.buildTransactionSummaryLine(extracted);

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

        // Queue for event publishing (Finance Core webhook)
        await enqueue(
          QueueName.EVENT_PUBLISHING,
          JobName.PUBLISH_FINANCIAL_EVENT,
          {
            transactionId: transaction.id,
            eventType: "transaction.created",
          },
        );

        // Queue for budget check if expense
        if (extracted.type === "expense" && categoryId) {
          await enqueue(QueueName.BUDGET_CHECK, JobName.CHECK_BUDGET, {
            userId: data.userId,
            categoryId,
            transactionId: transaction.id,
            amount: extracted.total_amount,
          });
        }
      }
    }

    // ── 5. Update raw_message status ──────────────────────────────────────────
    const hasPending = pendingIds.length > 0;
    await db
      .update(rawMessages)
      .set({
        processingStatus: hasPending ? "pending_confirmation" : "done",
        processedAt: new Date(),
      })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 6. Store pending confirmation state in Valkey ─────────────────────────
    if (hasPending) {
      const pendingPayload = JSON.stringify({
        transactionIds: pendingIds,
        rawMessageId: data.rawMessageId,
      });
      await this.valkey.set(
        pendingConfirmKey(data.from),
        pendingPayload,
        "EX",
        PENDING_CONFIRMATION_TTL_SECONDS,
      );
    }

    // ── 7. Send reply ─────────────────────────────────────────────────────────
    const replyText = this.buildReply(
      savedSummaries,
      pendingSummaries,
      savedIds.length,
      pendingIds.length,
      pendingReasons as (
        | "low_confidence"
        | "suspicious_amount"
        | "missing_payment_method"
      )[],
    );
    await sendWaMessage(data.from, replyText, data.rawMessageId);
  }

  // ─── Reply builders ────────────────────────────────────────────────────────

  private buildReply(
    savedSummaries: string[],
    pendingSummaries: string[],
    savedCount: number,
    pendingCount: number,
    pendingReasons: (
      | "low_confidence"
      | "suspicious_amount"
      | "missing_payment_method"
    )[] = [],
  ): string {
    const lines: string[] = [];

    const hasSuspicious = pendingReasons.includes("suspicious_amount");
    const hasMissingMethod = pendingReasons.includes("missing_payment_method");

    let confirmationNote = "Perlu konfirmasi dulu:";
    if (hasSuspicious) {
      confirmationNote =
        "Nominal dari gambar tampak tidak wajar, mohon konfirmasi:";
    } else if (hasMissingMethod) {
      confirmationNote =
        "Metode pembayaran belum diisi, mohon lengkapi (balas dengan nama metode pembayarannya) atau konfirmasi:";
    }

    if (savedCount > 0 && pendingCount === 0) {
      if (savedCount === 1) {
        lines.push("Tercatat.", "", ...savedSummaries);
      } else {
        lines.push(`${savedCount} transaksi tercatat:`, "");
        savedSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      }
    } else if (pendingCount > 0 && savedCount === 0) {
      lines.push(confirmationNote, "");
      pendingSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("", "Balas *ya* untuk simpan, *tidak* untuk batalkan.");
    } else {
      if (savedCount > 0) {
        lines.push(`${savedCount} transaksi tersimpan:`);
        savedSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
        lines.push("");
      }
      lines.push(confirmationNote, "");
      pendingSummaries.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push("", "Balas *ya* untuk simpan, *tidak* untuk batalkan.");
    }

    return lines.join("\n");
  }

  private buildTransactionSummaryLine(extracted: AiExtractionOutput): string {
    const typeLabel = getTransactionTypeLabel(extracted.type);
    const amountStr = formatCurrency(
      extracted.total_amount,
      extracted.currency,
    );
    const itemName = extracted.name ?? "Transaksi";

    // Format: *Nama* - Rp X.XXX
    // Detail baris: Tipe · Merchant · Metode · #tag
    let line = `*${itemName}* - ${amountStr}`;

    const details: string[] = [typeLabel];
    if (extracted.merchant) details.push(extracted.merchant);
    if (extracted.payment_method)
      details.push(`via ${extracted.payment_method}`);
    if (extracted.tags && extracted.tags.length > 0) {
      details.push(extracted.tags.map((t) => `#${t.trim()}`).join(" "));
    }

    line += `\n_${details.join(" · ")}_`;
    return line;
  }

  // ─── Category Resolution ───────────────────────────────────────────────────
  private async resolveCategory(
    db: ReturnType<typeof getDb>,
    categorySlug: string,
    transactionType: string,
    userId: string,
  ): Promise<string | null> {
    const rows = await db
      .select({
        id: transactionCategories.id,
        userId: transactionCategories.userId,
      })
      .from(transactionCategories)
      .where(
        and(
          ilike(transactionCategories.slug, categorySlug),
          eq(
            transactionCategories.type,
            transactionType as "expense" | "income" | "transfer",
          ),
          or(
            isNull(transactionCategories.userId),
            eq(transactionCategories.userId, userId),
          ),
        ),
      )
      .limit(2);

    const found = rows.find((r) => r.userId === userId) ?? rows[0];
    if (found) return found.id;

    const fallbackSlug =
      transactionType === "income"
        ? "other_income"
        : transactionType === "transfer"
          ? "transfer_account"
          : "other_expense";

    const [fallback] = await db
      .select({ id: transactionCategories.id })
      .from(transactionCategories)
      .where(
        and(
          eq(transactionCategories.slug, fallbackSlug),
          isNull(transactionCategories.userId),
        ),
      )
      .limit(1);

    return fallback?.id ?? null;
  }

  // ─── Tags Resolution ───────────────────────────────────────────────────────
  private async resolveTags(
    db: ReturnType<typeof getDb>,
    tagsFromAi: string[],
    userId: string,
  ): Promise<string[]> {
    if (!tagsFromAi || tagsFromAi.length === 0) return [];

    const tagIds: string[] = [];
    for (const rawTag of tagsFromAi) {
      const cleanTag = rawTag.trim();
      if (!cleanTag) continue;

      // Cari tag (case-insensitive) milik user ini
      const [existingTag] = await db
        .select({ id: transactionTags.id })
        .from(transactionTags)
        .where(
          and(
            eq(transactionTags.userId, userId),
            ilike(transactionTags.name, cleanTag),
          ),
        )
        .limit(1);

      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        // Jika belum ada, auto-create
        const [newTag] = await db
          .insert(transactionTags)
          .values({
            userId,
            name: toTitleCase(cleanTag),
            // Opsional: kita bisa pasang logic random color di masa depan, saat ini null
          })
          .returning({ id: transactionTags.id });

        tagIds.push(newTag.id);
      }
    }

    return tagIds;
  }

  // ─── Payment Method Resolution ─────────────────────────────────────────────
  private async resolvePaymentMethod(
    db: ReturnType<typeof getDb>,
    nameFromAi: string,
    userId: string,
  ): Promise<string | null> {
    const allMethods = await db
      .select({ id: paymentMethods.id, name: paymentMethods.name })
      .from(paymentMethods)
      .where(
        or(isNull(paymentMethods.userId), eq(paymentMethods.userId, userId)),
      );

    const lower = nameFromAi.toLowerCase().trim();

    let match = allMethods.find((m) => m.name.toLowerCase() === lower);
    if (match) return match.id;

    match = allMethods.find(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        lower.includes(m.name.toLowerCase()),
    );
    if (match) {
      this.logger.debug(
        { nameFromAi, matched: match.name },
        "Fuzzy payment method match",
      );
      return match.id;
    }

    this.logger.info(
      { nameFromAi },
      "No fuzzy match, asking AI to disambiguate payment method",
    );
    const methodList = allMethods.map((m) => m.name).join(", ");
    const aiPick = await this.askAiForPaymentMethod(nameFromAi, methodList);

    if (aiPick) {
      const aiMatch = allMethods.find((m) => m.name === aiPick);
      if (aiMatch) {
        this.logger.info(
          { nameFromAi, aiPick },
          "AI disambiguated payment method",
        );
        return aiMatch.id;
      }
    }

    this.logger.warn(
      { nameFromAi },
      "Payment method not resolved by AI either",
    );
    return null;
  }

  private async askAiForPaymentMethod(
    nameFromAi: string,
    availableList: string,
  ): Promise<string | null> {
    try {
      const res = await axios.post(
        `${getConfig("SUMOPOD_BASE_URL")}/chat/completions`,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Kamu adalah classifier metode pembayaran. " +
                "Pilih satu nama dari daftar yang paling cocok dengan input user. " +
                'Balas HANYA dengan nama persis dari daftar, atau "NONE" jika tidak ada yang cocok.',
            },
            {
              role: "user",
              content: `Input: "${nameFromAi}"\nDaftar: ${availableList}`,
            },
          ],
          temperature: 0,
          max_tokens: 32,
        },
        {
          headers: {
            Authorization: `Bearer ${getConfig("SUMOPOD_API_KEY")}`,
            "Content-Type": "application/json",
          },
          timeout: 8_000,
        },
      );

      const answer: string = res.data.choices[0].message.content.trim();
      return answer === "NONE" ? null : answer;
    } catch (err) {
      this.logger.warn({ err }, "AI payment method disambiguation failed");
      return null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  private async handleExtractionFailure(
    db: ReturnType<typeof getDb>,
    rawMessageId: string,
    error: string,
    chatId: string,
  ): Promise<void> {
    // 1. Fetch raw_message to check for storagePath
    const [msg] = await db
      .select({ storagePath: rawMessages.storagePath })
      .from(rawMessages)
      .where(eq(rawMessages.id, rawMessageId))
      .limit(1);

    // 2. Delete media if exists (Garbage Collection)
    if (msg?.storagePath) {
      await this.storageProvider.deleteMedia(msg.storagePath);

      // Update DB to nullify storagePath
      await db
        .update(rawMessages)
        .set({ storagePath: null })
        .where(eq(rawMessages.id, rawMessageId));

      this.logger.info(
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
    await sendWaMessage(chatId, this.getExtractionErrorReply(), rawMessageId);
  }

  private async markFailed(
    db: ReturnType<typeof getDb>,
    rawMessageId: string,
    error: string,
  ): Promise<void> {
    await db
      .update(rawMessages)
      .set({
        processingStatus: "failed",
        processingError: error,
        processedAt: new Date(),
      })
      .where(eq(rawMessages.id, rawMessageId));
  }

  private getExtractionErrorReply(): string {
    return (
      `Maaf, aku tidak bisa memahami transaksi itu.\n\n` +
      `Coba format seperti:\n` +
      `• _"Makan siang 25rb gopay"_\n` +
      `• _"Bayar listrik 150rb transfer BCA"_\n` +
      `• _"Terima gaji 5jt"_\n` +
      `• _"Tf ke OVO 100rb dari Dana, admin 1rb"_`
    );
  }
}
