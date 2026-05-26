import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // TODO: add processors as we build them:
    // VoiceTranscriptionModule,
    // ImageOcrModule,
    // AiExtractionModule,
    // CategorizationModule,
    // ReportGenerationModule,
  ],
})
export class WorkerModule {}
