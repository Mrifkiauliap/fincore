import getConfig from "@fincore/config";
import { trackEvent } from "@fincore/db";
import { createLogger, Logger } from "@fincore/logger";
import { getSharedValkey } from "@fincore/queue";
import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker, WorkerOptions } from "bullmq";

/**
 * Base class for all BullMQ processors.
 * Uses a single shared Valkey connection (getSharedValkey) for all workers.
 *
 * Usage:
 * @Injectable()
 * export class MyProcessor extends BaseProcessor {
 *   queueName = QueueName.MY_QUEUE;
 *   async process(job: Job) { ... }
 * }
 */
export abstract class BaseProcessor implements OnModuleInit, OnModuleDestroy {
  abstract readonly queueName: string;
  protected readonly logger: Logger;
  private worker!: Worker;

  constructor(loggerName: string) {
    this.logger = createLogger(loggerName);
  }

  onModuleInit() {
    const opts: WorkerOptions = {
      connection: getSharedValkey(),
      concurrency: Number(getConfig("WORKER_CONCURRENCY") ?? 5),
      ...this.workerOptions(),
    };

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const start = Date.now();
        this.logger.info({ jobId: job.id, jobName: job.name }, "Job started");

        try {
          await this.process(job);
          this.logger.info(
            { jobId: job.id, durationMs: Date.now() - start },
            "Job completed",
          );
        } catch (err) {
          this.logger.error(
            { jobId: job.id, err, durationMs: Date.now() - start },
            "Job failed",
          );
          throw err;
        }
      },
      opts,
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error({ jobId: job?.id, err }, "Job permanently failed");
      trackEvent({
        category: "queue",
        event: "job.permanently_failed",
        metadata: {
          jobId: job?.id ?? "unknown",
          jobName: job?.name ?? this.queueName,
          error: String(err),
        },
      }).catch(() => {}); // fire-and-forget
    });

    this.logger.info(`⚙️  Processor started: ${this.queueName}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.info(`Processor stopped: ${this.queueName}`);
  }

  abstract process(job: Job): Promise<void>;

  protected workerOptions(): Partial<WorkerOptions> {
    return {};
  }
}
