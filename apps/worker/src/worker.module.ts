import { AiExtractionProcessor } from "@/processors/ai-extraction.processor";
import { ConfirmationProcessor } from "@/processors/confirmation.processor";
import { ImageOcrProcessor } from "@/processors/image-ocr.processor";
import { IncomingMessageProcessor } from "@/processors/messsage.processor";
import { RecurringReminderProcessor } from "@/processors/recurring-reminder.processor";
import { RecurringSetupProcessor } from "@/processors/recurring-setup.processor";
import { ReportProcessor } from "@/processors/report.processor";
import { VoiceTranscriptionProcessor } from "@/processors/voice-transcription.processor";
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  providers: [
    IncomingMessageProcessor,
    VoiceTranscriptionProcessor,
    ImageOcrProcessor,
    AiExtractionProcessor,
    ReportProcessor,
    ConfirmationProcessor,
    RecurringSetupProcessor,
    RecurringReminderProcessor,
  ],
})
export class WorkerModule {}
