import { WorkerModule } from "@/worker.module";
import { createLogger } from "@fincore/logger";
import { NestFactory } from "@nestjs/core";

const logger = createLogger("worker");

// Tambah limit listener karena kita punya banyak BullMQ worker processors
process.setMaxListeners(30);

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });

  await app.init();

  logger.info("⚙️  Worker is running and listening for jobs...");
}

bootstrap().catch((err) => {
  console.error("Failed to start Worker:", err);
  process.exit(1);
});
