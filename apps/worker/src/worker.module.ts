import { AiExtractionProcessor } from "@/processors/ai/ai-extraction.processor";
import { BudgetCheckProcessor } from "@/processors/budget/budget-check.processor";
import { BudgetCommandProcessor } from "@/processors/budget/budget-command.processor";
import { BudgetRolloverProcessor } from "@/processors/budget/budget-rollover.processor";
import { ConfirmationProcessor } from "@/processors/confirmation/confirmation.processor";
import { CustomCommandProcessor } from "@/processors/custom-command/custom-command.processor";
import { EventPublishingProcessor } from "@/processors/event/event-publishing.processor";
import { IncomingMessageProcessor } from "@/processors/incoming/message.processor";
import { MonthlyReportProcessor } from "@/processors/monthly/monthly-report.processor";
import { ImageOcrProcessor } from "@/processors/ocr/image-ocr.processor";
import { RecurringReminderProcessor } from "@/processors/recurring/recurring-reminder.processor";
import { RecurringSetupProcessor } from "@/processors/recurring/recurring-setup.processor";
import { ReportProcessor } from "@/processors/report/report.processor";
import { SettingsCommandProcessor } from "@/processors/settings/settings-command.processor";
import { TransactionCommandProcessor } from "@/processors/transaction/transaction-command.processor";
import { VoiceTranscriptionProcessor } from "@/processors/voice/voice-transcription.processor";
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
    BudgetRolloverProcessor,
    TransactionCommandProcessor,
    CustomCommandProcessor,
    SettingsCommandProcessor,
    SchedulerService,
  ],
})
export class WorkerModule {}
