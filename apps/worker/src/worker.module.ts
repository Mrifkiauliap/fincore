import { AiExtractionProcessor } from "@/processors/ai-extraction.processor";
import { BudgetCheckProcessor } from "@/processors/budget-check.processor";
import { BudgetCommandProcessor } from "@/processors/budget-command.processor";
import { ConfirmationProcessor } from "@/processors/confirmation.processor";
import { CustomCommandProcessor } from "@/processors/custom-command.processor";
import { EventPublishingProcessor } from "@/processors/event-publishing.processor";
import { ImageOcrProcessor } from "@/processors/image-ocr.processor";
import { IncomingMessageProcessor } from "@/processors/messsage.processor";
import { MonthlyReportProcessor } from "@/processors/monthly-report.processor";
import { RecurringReminderProcessor } from "@/processors/recurring-reminder.processor";
import { RecurringSetupProcessor } from "@/processors/recurring-setup.processor";
import { ReportProcessor } from "@/processors/report.processor";
import { SettingsCommandProcessor } from "@/processors/settings-command.processor";
import { TransactionCommandProcessor } from "@/processors/transaction-command.processor";
import { VoiceTranscriptionProcessor } from "@/processors/voice-transcription.processor";
import { SchedulerService } from "@/scheduler.service";
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
    EventPublishingProcessor,
    MonthlyReportProcessor,
    BudgetCheckProcessor,
    BudgetCommandProcessor,
    TransactionCommandProcessor,
    CustomCommandProcessor,
    SettingsCommandProcessor,
    SchedulerService,
  ],
})
export class WorkerModule {}
