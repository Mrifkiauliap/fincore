import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createLogger } from '@fincore/logger';

const logger = createLogger('api');

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FinCore API')
      .setDescription('FinCore Finance Assistant API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.APP_PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.info(`🚀 API running on http://localhost:${port}`);
  logger.info(`📚 Swagger: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
