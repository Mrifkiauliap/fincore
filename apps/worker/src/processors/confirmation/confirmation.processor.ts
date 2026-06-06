import { BaseProcessor } from "@/processors/base.processor";
import {
  getDb,
  paymentMethods,
  rawMessages,
  trackEvent,
  transactions,
} from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { enqueue, getSharedValkey, sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { eq, inArray, isNull, or } from "drizzle-orm";

const logger = createLogger("processor:confirmation");

interface ConfirmationJobData {
  chatId: string;
  senderPhone: string;
  answer: string;
}

const pendingConfirmKey = (chatId: string) =>
  `fincore:pending_confirm:${chatId}`;

@Injectable()
export class ConfirmationProcessor extends BaseProcessor {
  readonly queueName = QueueName.CONFIRMATION;
  private valkey = getSharedValkey();

  constructor() {
    super("processor:confirmation");
  }

  async process(job: Job<ConfirmationJobData>): Promise<void> {
    const { chatId, answer } = job.data;
    const db = getDb();

    // ── 1. Cek apakah ada pending confirmation ──────────────────────────────
    const raw = await this.valkey.get(pendingConfirmKey(chatId));
    if (!raw) {
      await sendWaMessage(
        chatId,
        "Tidak ada transaksi yang menunggu konfirmasi.",
      );
      return;
    }

    const { transactionIds, rawMessageId } = JSON.parse(raw) as {
      transactionIds: string[];
      rawMessageId: string;
    };

    const isPositive =
      answer === "yes" ||
      [
        "ya",
        "iya",
        "oke",
        "ok",
        "benar",
        "betul",
        "yes",
        "yep",
        "simpan",
        "konfirmasi",
      ].includes(answer.toLowerCase().trim());

    const isNegative = [
      "tidak",
      "batal",
      "cancel",
      "no",
      "bukan",
      "salah",
      "hapus",
    ].includes(answer.toLowerCase().trim());

    if (isPositive) {
      // ── 2a. Konfirmasi ────────────────────────────────────────────────────
      await db
        .update(transactions)
        .set({ isConfirmed: true })
        .where(inArray(transactions.id, transactionIds));

      await db
        .update(rawMessages)
        .set({ processingStatus: "done", processedAt: new Date() })
        .where(eq(rawMessages.id, rawMessageId));

      const confirmedTxs = await db
        .select()
        .from(transactions)
        .where(inArray(transactions.id, transactionIds));

      for (const tx of confirmedTxs) {
        await enqueue(
          QueueName.EVENT_PUBLISHING,
          JobName.PUBLISH_FINANCIAL_EVENT,
          { transactionId: tx.id, eventType: "transaction.created" },
        );

        if (tx.type === "expense" && tx.categoryId) {
          await enqueue(QueueName.BUDGET_CHECK, JobName.CHECK_BUDGET, {
            userId: tx.userId,
            categoryId: tx.categoryId,
            transactionId: tx.id,
            amount: Number(tx.totalAmount),
          });
        }
      }

      logger.info({ transactionIds, chatId }, "Transactions confirmed by user");

      for (const tx of confirmedTxs) {
        trackEvent({
          category: "transaction",
          event: "transaction.confirmed",
          userId: tx.userId,
        }).catch(() => {});
      }

      await sendWaMessage(
        chatId,
        transactionIds.length > 1
          ? `${transactionIds.length} transaksi berhasil disimpan.`
          : "Transaksi berhasil disimpan.",
      );
    } else if (isNegative) {
      // ── 2b. Batalkan ──────────────────────────────────────────────────────
      await db
        .update(transactions)
        .set({ isDeleted: true })
        .where(inArray(transactions.id, transactionIds));

      await db
        .update(rawMessages)
        .set({
          processingStatus: "failed",
          processingError: "Dibatalkan oleh user",
        })
        .where(eq(rawMessages.id, rawMessageId));

      logger.info({ transactionIds, chatId }, "Transactions cancelled by user");

      await sendWaMessage(chatId, "Oke, transaksi dibatalkan.");
    } else {
      // ── 2c. Coba resolve sebagai metode pembayaran ────────────────────────
      const [sampleTx] = await db
        .select({ userId: transactions.userId })
        .from(transactions)
        .where(eq(transactions.id, transactionIds[0]))
        .limit(1);

      if (sampleTx) {
        const lowerAnswer = answer.toLowerCase().trim();
        const availableMethods = await db
          .select({ id: paymentMethods.id, name: paymentMethods.name })
          .from(paymentMethods)
          .where(
            or(
              isNull(paymentMethods.userId),
              eq(paymentMethods.userId, sampleTx.userId),
            ),
          );

        let match = availableMethods.find(
          (m) => m.name.toLowerCase() === lowerAnswer,
        );
        if (!match) {
          match = availableMethods.find(
            (m) =>
              m.name.toLowerCase().includes(lowerAnswer) ||
              lowerAnswer.includes(m.name.toLowerCase()),
          );
        }

        if (match) {
          await db
            .update(transactions)
            .set({ paymentMethodId: match.id, isConfirmed: true })
            .where(inArray(transactions.id, transactionIds));

          await db
            .update(rawMessages)
            .set({ processingStatus: "done", processedAt: new Date() })
            .where(eq(rawMessages.id, rawMessageId));

          const confirmedTxs = await db
            .select()
            .from(transactions)
            .where(inArray(transactions.id, transactionIds));

          for (const tx of confirmedTxs) {
            await enqueue(
              QueueName.EVENT_PUBLISHING,
              JobName.PUBLISH_FINANCIAL_EVENT,
              { transactionId: tx.id, eventType: "transaction.created" },
            );

            if (tx.type === "expense" && tx.categoryId) {
              await enqueue(QueueName.BUDGET_CHECK, JobName.CHECK_BUDGET, {
                userId: tx.userId,
                categoryId: tx.categoryId,
                transactionId: tx.id,
                amount: Number(tx.totalAmount),
              });
            }
          }

          logger.info(
            { transactionIds, chatId, paymentMethod: match.name },
            "Transactions confirmed with new payment method",
          );

          await sendWaMessage(chatId, `Tercatat menggunakan ${match.name}.`);
          await this.valkey.del(pendingConfirmKey(chatId));
          return;
        }
      }

      await sendWaMessage(
        chatId,
        "Jawaban tidak dikenali.\nBalas *ya* untuk konfirmasi, *tidak* untuk batalkan, atau balas dengan *nama metode pembayaran* jika metode sebelumnya kosong.",
      );
      return;
    }

    // ── 3. Hapus session dari Valkey ─────────────────────────────────────────
    await this.valkey.del(pendingConfirmKey(chatId));
  }
}
