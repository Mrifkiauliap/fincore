import { createLogger } from "@fincore/logger";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Injectable, OnModuleInit } from "@nestjs/common";

const logger = createLogger("scheduler");

@Injectable()
export class SchedulerService implements OnModuleInit {
  async onModuleInit() {
    logger.info("Registering repeatable jobs...");

    try {
      // Daftarkan laporan bulanan otomatis (Tanggal 1, jam 07:00 pagi WIB)
      await enqueue(
        QueueName.MONTHLY_REPORT,
        JobName.GENERATE_MONTHLY_REPORT,
        {},
        {
          repeat: { pattern: "0 7 1 * *", tz: "Asia/Jakarta" },
          jobId: "monthly-report-scheduler-v1", // Mencegah duplikasi job registrasi
        },
      );
      logger.info("Scheduler initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to register repeatable jobs");
    }
  }
}
