import { DatabaseModule } from "@/modules/database/database.module";
import { WebhookModule } from "@/modules/webhook/webhook.module";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    // DatabaseModule is @Global() - provides DRIZZLE token to all modules
    DatabaseModule,
    WebhookModule,
    // TransactionModule,
    // ReportModule,
    // AuthModule,
  ],
})
export class AppModule {}
