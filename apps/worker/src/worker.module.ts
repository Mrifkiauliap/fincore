import { AiExtractionProcessor } from "@/processors/ai-extraction.processor";
import { IncomingMessageProcessor } from "@/processors/messsage.processor";
import { ReportProcessor } from "@/processors/report.processor";
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  providers: [
    IncomingMessageProcessor,
    AiExtractionProcessor,
    ReportProcessor,
    // TODO: add more as we build them:
    // VoiceTranscriptionProcessor,
    // ImageOcrProcessor,
    // CategorizationProcessor,
  ],
})
export class WorkerModule {}
