import { WorkerModule } from "@/worker.module";
import { createLogger } from "@fincore/logger";
import { NestFactory } from "@nestjs/core";

import { EventEmitter } from "events";

const logger = createLogger("worker");

// Tambah limit listener karena kita punya banyak BullMQ worker processors
EventEmitter.defaultMaxListeners = 20;

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
