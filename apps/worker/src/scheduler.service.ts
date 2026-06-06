import { createLogger } from "@fincore/logger";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";

const logger = createLogger("scheduler");

const REPEATABLE_JOB_IDS = [
  "budget-rollover-scheduler-v1",
  "monthly-report-scheduler-v1",
] as const;

@Injectable()
export class SchedulerService implements OnModuleInit {
  async onModuleInit() {
    logger.info("Registering repeatable jobs...");

    for (const jobId of REPEATABLE_JOB_IDS) {
      try {
        await this.registerJob(jobId);
      } catch (error) {
        logger.error({ error, jobId }, "Failed to register repeatable job");
      }
    }

    logger.info("Scheduler initialized successfully");
  }

  private async registerJob(jobId: string): Promise<void> {
    switch (jobId) {
      case "budget-rollover-scheduler-v1":
        await enqueue(
          QueueName.BUDGET_ROLLOVER,
          JobName.ROLLOVER_BUDGETS,
          {},
          {
            repeat: { pattern: "0 1 1 * *", tz: "Asia/Jakarta" },
            jobId,
          },
        );
        break;
      case "monthly-report-scheduler-v1":
        await enqueue(
          QueueName.MONTHLY_REPORT,
          JobName.GENERATE_MONTHLY_REPORT,
          {},
          {
            repeat: { pattern: "0 7 1 * *", tz: "Asia/Jakarta" },
            jobId,
          },
        );
        break;
    }
  }
}
