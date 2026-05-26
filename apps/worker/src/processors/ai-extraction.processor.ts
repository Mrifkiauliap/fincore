import { BaseProcessor } from "@/processors/base.processor";
import { SumopodProvider } from "@fincore/ai";
import getConfig from "@fincore/config";
import { AiExtractionOutput } from "@fincore/contracts";
import {
  getDb,
  paymentMethods,
  rawAiOutputs,
  rawMessages,
  transactionCategories,
  transactions,
} from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, MessageType, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import axios from "axios";
import { Job } from "bullmq";
import { and, eq, ilike, isNull, or } from "drizzle-orm";

interface AiExtractionJobData {
  rawMessageId: string; // DB UUID (raw_messages.id)
  userId: string; // DB UUID (users.id)
  from: string; // WhatsApp chatId for reply
  sourceType: MessageType;
  content: string;
}

const CONFIDENCE_THRESHOLD = 0.4;

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

    this.logger.info(
      { rawMessageId: data.rawMessageId, userId: data.userId },
      "Starting AI extraction",
    );

    // ── 1. Extract via AI ─────────────────────────────────────────────────────
    let extracted: AiExtractionOutput;
    let rawResponse = "";
    try {
      extracted = await this.ai.extractTransaction(data.content);
      rawResponse = JSON.stringify(extracted);
    } catch (err) {
      // AI call failed entirely > mark failed, send error reply
      await this.markFailed(
        db,
        data.rawMessageId,
        `AI extraction error: ${(err as Error).message}`,
      );
      await this.sendReply(data.from, this.getExtractionErrorReply());
      throw err; // rethrow so BullMQ handles retry
    }

    // ── 2. Confidence check ───────────────────────────────────────────────────
    if (extracted.confidence_score < CONFIDENCE_THRESHOLD) {
      this.logger.info(
        { confidence: extracted.confidence_score },
        "Low confidence, skipping transaction save",
      );
      await this.markFailed(
        db,
        data.rawMessageId,
        `Low confidence: ${extracted.confidence_score}`,
      );
      await this.sendReply(data.from, this.getExtractionErrorReply());
      return;
    }

    // ── 3. Save raw_ai_output (audit log) ─────────────────────────────────────
    await db.insert(rawAiOutputs).values({
      rawMessageId: data.rawMessageId,
      prompt: data.content,
      response: rawResponse,
      parsedOutput: extracted,
      provider: "sumopod",
      model: "gpt-4o-mini",
      isValid: true,
    });

    // ── 4. Resolve category ───────────────────────────────────────────────────
    const categoryId = await this.resolveCategory(
      db,
      extracted.category,
      extracted.type,
      data.userId,
    );

    // ── 5. Resolve payment method (with AI fallback + semantic match) ─────────
    const paymentMethodId = extracted.payment_method
      ? await this.resolvePaymentMethod(
          db,
          extracted.payment_method,
          data.userId,
          data.from,
        )
      : null;

    // null means resolution failed AND user was notified — abort
    if (extracted.payment_method && paymentMethodId === false) {
      await this.markFailed(
        db,
        data.rawMessageId,
        `Payment method not resolved: ${extracted.payment_method}`,
      );
      return;
    }

    // Resolve to_payment_method for transfers
    const toPaymentMethodId =
      extracted.type === "transfer" && extracted.to_payment_method
        ? await this.resolvePaymentMethod(
            db,
            extracted.to_payment_method,
            data.userId,
            data.from,
          )
        : null;

    // ── 6. Insert transaction ──────────────────────────────────────────────────
    const transactionDate = new Date();

    const [transaction] = await db
      .insert(transactions)
      .values({
        userId: data.userId,
        rawMessageId: data.rawMessageId,
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
        isConfirmed: extracted.confidence_score >= 0.7,
        transactionDate,
      })
      .returning();

    this.logger.info(
      {
        transactionId: transaction.id,
        type: extracted.type,
        amount: extracted.amount,
        latencyMs: Date.now() - start,
      },
      "Transaction saved ✅",
    );

    // ── 7. Update raw_message status ──────────────────────────────────────────
    await db
      .update(rawMessages)
      .set({ processingStatus: "done", processedAt: new Date() })
      .where(eq(rawMessages.id, data.rawMessageId));

    // ── 8. Send confirmation reply to user ────────────────────────────────────
    const replyText = this.buildConfirmationReply(extracted, transaction.id);
    await this.sendReply(data.from, replyText);
  }

  // ─── Category Resolution ──────────────────────────────────────────────────
  private async resolveCategory(
    db: ReturnType<typeof getDb>,
    categorySlug: string,
    transactionType: string,
    userId: string,
  ): Promise<string | null> {
    // Try exact slug match: user-specific rows first, then global (userId IS NULL)
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

    // Prefer user-specific match over global
    const found = rows.find((r) => r.userId === userId) ?? rows[0];
    if (found) return found.id;

    // Fallback to "other_*" category (global)
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

  // ─── Payment Method Resolution ────────────────────────────────────────────
  /**
   * Returns:
   * - string  > resolved paymentMethodId
   * - null    > no payment method specified (OK to save null)
   * - false   > resolution failed, user was notified, abort transaction
   */
  private async resolvePaymentMethod(
    db: ReturnType<typeof getDb>,
    nameFromAi: string,
    userId: string,
    chatId: string,
  ): Promise<string | null | false> {
    // Fetch all available payment methods (global + user-specific)
    const allMethods = await db
      .select({ id: paymentMethods.id, name: paymentMethods.name })
      .from(paymentMethods)
      .where(
        or(isNull(paymentMethods.userId), eq(paymentMethods.userId, userId)),
      );

    const lower = nameFromAi.toLowerCase().trim();

    // 1. Exact case-insensitive match
    let match = allMethods.find((m) => m.name.toLowerCase() === lower);
    if (match) return match.id;

    // 2. Partial / contains match (both directions)
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

    // 3. AI disambiguation — ask cheap model to pick from the list
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

    // 4. Completely unresolved > send rejection to user
    this.logger.warn(
      { nameFromAi },
      "Payment method not resolved, notifying user",
    );
    await this.sendReply(
      chatId,
      `Maaf, metode pembayaran *"${nameFromAi}"* tidak ditemukan.\n\n` +
        `Metode yang tersedia:\n${allMethods.map((m) => `• ${m.name}`).join("\n")}\n\n` +
        `Silakan kirim ulang dengan metode pembayaran yang tepat.`,
    );
    return false;
  }

  /** Call a cheap AI model to pick the closest payment method from a list. */
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
          max_tokens: 30,
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

  // ─── Helpers ──────────────────────────────────────────────────────────────
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

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }

  private buildConfirmationReply(
    extracted: AiExtractionOutput,
    transactionId: string,
  ): string {
    const typeLabel =
      extracted.type === "expense"
        ? "Pengeluaran"
        : extracted.type === "income"
          ? "Pemasukan"
          : "Transfer";

    const amount = new Intl.NumberFormat("id-ID").format(extracted.amount);
    const total = new Intl.NumberFormat("id-ID").format(extracted.total_amount);
    const feeStr =
      extracted.fee > 0
        ? `\n• Fee: Rp ${new Intl.NumberFormat("id-ID").format(extracted.fee)}${extracted.fee_note ? ` _(${extracted.fee_note})_` : ""}`
        : "";

    const lines = [
      `Transaksi tercatat!`,
      ``,
      `[${typeLabel}]`,
      `• Jumlah: Rp ${amount}${feeStr}`,
      extracted.fee > 0 ? `• Total: Rp ${total}` : null,
      `• Kategori: ${extracted.category}`,
      extracted.payment_method ? `• Metode: ${extracted.payment_method}` : null,
      extracted.to_payment_method
        ? `• Tujuan: ${extracted.to_payment_method}`
        : null,
      extracted.merchant ? `• Merchant: ${extracted.merchant}` : null,
      extracted.notes ? `• Catatan: ${extracted.notes}` : null,
      ``,
      `Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    ];

    return lines.filter((l) => l !== null).join("\n");
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
