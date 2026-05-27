import getConfig from "@fincore/config";
import { createLogger, Logger } from "@fincore/logger";
import { createValkeyConnection } from "@fincore/queue";
import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker, WorkerOptions } from "bullmq";

/**
 * Base class for all BullMQ processors.
 * Handles worker lifecycle (init/destroy) and error logging.
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
      connection: createValkeyConnection(),
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
