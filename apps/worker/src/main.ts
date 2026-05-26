import { createLogger } from "@fincore/logger";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

const logger = createLogger("worker");

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, {
    logger: false,
  });

  await app.init();

  logger.info("⚙️  Worker is running and listening for jobs...");
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start Worker");
  process.exit(1);
});
