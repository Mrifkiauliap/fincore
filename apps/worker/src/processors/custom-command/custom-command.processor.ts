import { findUserByPhone } from "@/lib/user-lookup";
import { BaseProcessor } from "@/processors/base.processor";
import { handleAddCommand } from "@/processors/custom-command/custom-add.processor";
import { handleListCommand } from "@/processors/custom-command/custom-list.processor";
import { handleSearchCommand } from "@/processors/custom-command/custom-search.processor";
import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";

const logger = createLogger("worker:custom-command");

export interface CustomCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

@Injectable()
export class CustomCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.CUSTOM_COMMAND;
  private readonly prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  constructor() {
    super("worker:custom-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<CustomCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_CUSTOM_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(chatId, "Pengguna tidak ditemukan.");
      return;
    }

    const lower = commandText.toLowerCase().trim();
    const p = this.prefix;

    // ── /tambah ──────────────────────────────────────────────────────────
    if (await handleAddCommand(chatId, user.id, p, lower, commandText)) return;

    // ── /lihat ───────────────────────────────────────────────────────────
    if (await handleListCommand(chatId, user.id, p, lower)) return;

    // ── /cari ────────────────────────────────────────────────────────────
    if (await handleSearchCommand(chatId, user.id, p, lower, commandText))
      return;

    // ── Fallback: unknown custom command ─────────────────────────────────
    await sendWaMessage(
      chatId,
      "❓ Contoh penggunaan:\n" +
        `• \`${p}tambah metode BCA Tabungan\`\n` +
        `• \`${p}tambah kategori Langganan Streaming expense\`\n` +
        `• \`${p}lihat metode\`\n` +
        `• \`${p}lihat kategori expense\`\n` +
        `• \`${p}cari bakso\`\n` +
        `• \`${p}cari #cheatday\``,
    );
  }
}
