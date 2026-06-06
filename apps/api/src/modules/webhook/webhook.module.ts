import { AuthModule } from "@/modules/auth/auth.module";
import { CommandRouterService } from "@/modules/webhook/command-router.service";
import { WebhookController } from "@/modules/webhook/webhook.controller";
import { WebhookService } from "@/modules/webhook/webhook.service";
import { Module } from "@nestjs/common";

@Module({
  imports: [AuthModule],
  controllers: [WebhookController],
  providers: [WebhookService, CommandRouterService],
  exports: [],
})
export class WebhookModule {}
