import { BaseProcessor } from "@/processors/base.processor";
import { getDb, rawMessages, transactions } from "@fincore/db";
import { createValkeyConnection, enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { eq, inArray } from "drizzle-orm";

interface ConfirmationJobData {
  chatId: string;
  senderPhone: string;
  answer: string; // "yes" | "no" | raw text
}

const pendingConfirmKey = (chatId: string) =>
  `fincore:pending_confirm:${chatId}`;

@Injectable()
export class ConfirmationProcessor extends BaseProcessor {
  readonly queueName = QueueName.CONFIRMATION;
  private valkey: ReturnType<typeof createValkeyConnection>;

  constructor() {
    super("processor:confirmation");
    this.valkey = createValkeyConnection();
  }

  async process(job: Job<ConfirmationJobData>): Promise<void> {
    const { chatId, answer } = job.data;
    const db = getDb();

    // ── 1. Cek apakah ada pending confirmation untuk user ini ──────────────────
    const raw = await this.valkey.get(pendingConfirmKey(chatId));
    if (!raw) {
      // Tidak ada transaksi pending — mungkin sudah expired atau belum pernah ada
      await this.sendReply(
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

    if (isPositive) {
      // ── 2a. Konfirmasi: update isConfirmed = true ─────────────────────────────
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

      // Queue for event publishing (Finance Core webhook) and budget checking
      for (const tx of confirmedTxs) {
        await enqueue(
          QueueName.EVENT_PUBLISHING,
          JobName.PUBLISH_FINANCIAL_EVENT,
          {
            transactionId: tx.id,
            eventType: "transaction.created",
          },
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

      this.logger.info(
        { transactionIds, chatId },
        "Transactions confirmed by user",
      );

      await this.sendReply(
        chatId,
        transactionIds.length > 1
          ? `${transactionIds.length} transaksi berhasil disimpan.`
          : "Transaksi berhasil disimpan.",
      );
    } else {
      // ── 2b. Batalkan: soft delete transaksi ───────────────────────────────────
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

      this.logger.info(
        { transactionIds, chatId },
        "Transactions cancelled by user",
      );

      await this.sendReply(chatId, "Oke, transaksi dibatalkan.");
    }

    // ── 3. Hapus session dari Valkey ───────────────────────────────────────────
    await this.valkey.del(pendingConfirmKey(chatId));
  }

  private async sendReply(chatId: string, text: string): Promise<void> {
    await enqueue(QueueName.WA_SENDER, JobName.SEND_WA_MESSAGE, {
      chatId,
      text,
    });
  }
}
