import { SenderModule } from "@/sender.module";
import { createLogger } from "@fincore/logger";
import { NestFactory } from "@nestjs/core";

const logger = createLogger("sender");

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(SenderModule, {
    logger: false,
  });

  // Graceful shutdown — prevents data corruption on container stop
  app.enableShutdownHooks();

  await app.init();
  logger.info("Sender is running and listening for outbound jobs...");
}

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to start Sender");
  process.exit(1);
});
