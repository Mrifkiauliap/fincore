import { BaseProcessor } from "@/processors/base.processor";
import getConfig from "@fincore/config";
import { sendWaMessage } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { createLogger } from "@fincore/logger";
import { findUserByPhone } from "@/lib/user-lookup";
import { getSharedValkey } from "@fincore/queue";
import { Injectable } from "@nestjs/common";
import { Job, WorkerOptions } from "bullmq";
import { handleDeleteLast, handleDeleteSearch } from "./transaction-delete";
import { handleListPendingConfirmations } from "./transaction-confirm";
import { handleEditSearch } from "./transaction-edit";
import {
  handlePendingAction,
  PendingActionState,
  pendingActionKey,
} from "./transaction-pending";

const logger = createLogger("worker:transaction-command");

export interface TransactionCommandJobData {
  chatId: string;
  senderPhone: string;
  commandText: string;
}

@Injectable()
export class TransactionCommandProcessor extends BaseProcessor {
  readonly queueName = QueueName.TRANSACTION_COMMAND;
  private readonly valkey = getSharedValkey();
  private readonly prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  constructor() {
    super("worker:transaction-command");
  }

  protected workerOptions(): Partial<WorkerOptions> {
    return { concurrency: 2 };
  }

  async process(job: Job<TransactionCommandJobData>): Promise<void> {
    if (job.name !== JobName.PROCESS_TRANSACTION_COMMAND) return;

    const { chatId, senderPhone, commandText } = job.data;

    const user = await findUserByPhone(senderPhone);
    if (!user) {
      await sendWaMessage(
        chatId,
        "Pengguna tidak ditemukan. Kirim pesan apapun terlebih dahulu untuk registrasi.",
      );
      return;
    }

    const lower = commandText.toLowerCase().trim();
    const sendWa = (to: string, text: string) => sendWaMessage(to, text);

    // 2. Cek apakah ini jawaban dari pending_action
    const rawPending = await this.valkey.get(pendingActionKey(chatId));
    if (rawPending) {
      const state = JSON.parse(rawPending) as PendingActionState;
      await handlePendingAction(
        chatId,
        user.id,
        state,
        lower,
        this.valkey,
        sendWa,
      );
      return;
    }

    // 3. Parse command
    if (
      lower === this.prefix + "hapus" ||
      lower === this.prefix + "hapus terakhir"
    ) {
      await handleDeleteLast(chatId, user.id, this.valkey, sendWa);
      return;
    }

    if (lower.startsWith(this.prefix + "hapus ")) {
      const query = commandText.slice((this.prefix + "hapus ").length).trim();
      await handleDeleteSearch(chatId, user.id, query, this.valkey, sendWa);
      return;
    }

    if (
      lower === this.prefix + "konfirmasi" ||
      lower === this.prefix + "konfirmasi semua"
    ) {
      await handleListPendingConfirmations(
        chatId,
        user.id,
        this.valkey,
        sendWa,
      );
      return;
    }

    if (lower.startsWith(this.prefix + "ubah ")) {
      const query = commandText.slice((this.prefix + "ubah ").length).trim();
      await handleEditSearch(chatId, user.id, query, this.valkey, sendWa);
      return;
    }

    await sendWaMessage(
      chatId,
      "❓ Perintah tidak dikenali.\n\nContoh:\n" +
        `• \`${this.prefix}hapus\` - hapus transaksi terakhir\n` +
        `• \`${this.prefix}hapus makan\` - cari transaksi untuk dihapus\n` +
        `• \`${this.prefix}ubah bakso\` - ubah transaksi\n` +
        `• \`${this.prefix}konfirmasi\` - lihat transaksi pending konfirmasi`,
    );
  }
}
