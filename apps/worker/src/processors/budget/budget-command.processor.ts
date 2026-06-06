import { findUserByPhone } from "@/lib/user-lookup";
import { BaseProcessor } from "@/processors/base.processor";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { handleCheckBudget } from "./budget-cek";
import { handleDeleteBudget } from "./budget-hapus";
import { handleSetBudget } from "./budget-set";

const logger = createLogger("worker:budget-command");

export interface BudgetCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

@Injectable()
export class BudgetCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.BUDGET_COMMAND;

  constructor() {
    super("worker:budget-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<BudgetCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_BUDGET_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(
        chatId,
        "Pengguna tidak ditemukan. Ketik pesan sapaan terlebih dahulu untuk registrasi.",
      );
      return;
    }

    const parts = commandText.trim().split(/\s+/);
    const action = parts[1]?.toLowerCase();

    switch (action) {
      case "set":
        await handleSetBudget(chatId, user, parts.slice(2));
        break;
      case "cek":
        await handleCheckBudget(chatId, user);
        break;
      case "hapus":
        await handleDeleteBudget(chatId, user, parts.slice(2));
        break;
      default:
        await sendWaMessage(
          chatId,
          "❓ Perintah `/budget` tidak valid.\n\nContoh penggunaan:\n" +
            "• `/budget set makan 1000000` (Set batas budget)\n" +
            "• `/budget cek` (Lihat status budget bulan ini)\n" +
            "• `/budget hapus makan` (Hapus budget kategori tersebut)",
        );
    }
  }
}
