import { WorkerModule } from "@/worker.module";
import { createLogger } from "@fincore/logger";
import { NestFactory } from "@nestjs/core";

const logger = createLogger("worker");

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });

  await app.init();

  logger.info("⚙️  Worker is running and listening for jobs...");
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start Worker");
  process.exit(1);
});
