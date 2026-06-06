import { WaSendService } from "@/modules/wa-send/wa-send.service";
import { createLogger } from "@fincore/logger";
import { getSharedValkey, Job, Worker, WorkerOptions } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

/**
 * Job data enqueued into the `wa-sender` queue for text messages.
 */
export interface SendWaMessageJobData {
  chatId: string;
  text: string;
  replyTo?: string;
}

/**
 * Job data for sending an image.
 */
export interface SendWaImageJobData {
  chatId: string;
  imageUrl: string;
  caption?: string;
}

const logger = createLogger("sender:wa-send-processor");

/**
 * BullMQ processor that listens to the `wa-sender` queue and
 * dispatches outbound WhatsApp messages via WAHA.
 */
@Injectable()
export class WaSendProcessor implements OnModuleInit, OnModuleDestroy {
  private worker!: Worker;

  constructor(private readonly waSend: WaSendService) {}

  onModuleInit() {
    const opts: WorkerOptions = {
      connection: getSharedValkey(),
      concurrency: 5,
    };

    this.worker = new Worker(
      QueueName.WA_SENDER,
      async (job: Job<SendWaMessageJobData | SendWaImageJobData>) => {
        const start = Date.now();

        // ── Image job ────────────────────────────────────────────────────────
        if (job.name === JobName.SEND_WA_IMAGE) {
          const { chatId, imageUrl, caption } = job.data as SendWaImageJobData;
          if (!chatId || !imageUrl) {
            logger.warn({ jobId: job.id }, "Invalid image job: missing data");
            return;
          }
          logger.info({ jobId: job.id, chatId }, "Processing image send job");
          try {
            await this.waSend.sendImage(chatId, imageUrl, caption);
            logger.info(
              { jobId: job.id, durationMs: Date.now() - start },
              "Image send job completed",
            );
          } catch (err) {
            logger.error(
              { jobId: job.id, err, durationMs: Date.now() - start },
              "Image send job failed",
            );
            throw err;
          }
          return;
        }

        // ── Text job ─────────────────────────────────────────────────────────
        const { chatId, text, replyTo } = job.data as SendWaMessageJobData;

        if (!chatId || !text) {
          logger.warn(
            { jobId: job.id, data: job.data },
            "Invalid job data: missing chatId or text",
          );
          return;
        }

        logger.info({ jobId: job.id, chatId }, "Processing send job");

        try {
          await this.waSend.sendText(chatId, text, replyTo);
          logger.info(
            { jobId: job.id, durationMs: Date.now() - start },
            "Send job completed",
          );
        } catch (err) {
          logger.error(
            { jobId: job.id, err, durationMs: Date.now() - start },
            "Send job failed",
          );
          throw err;
        }
      },
      opts,
    );

    this.worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, err }, "Send job permanently failed");
    });

    logger.info(`⚙️  WaSendProcessor started: ${QueueName.WA_SENDER}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    logger.info("WaSendProcessor stopped");
  }
}
