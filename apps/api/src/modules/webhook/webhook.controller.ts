import { OwnerOnlyGuard } from "@/common/guards/owner.guard";
import { WebhookSignatureGuard } from "@/common/guards/webhook-signature.guard";
import { WahaWebhookPayload } from "@/modules/webhook/waha-payload.dto";
import { WebhookService } from "@/modules/webhook/webhook.service";
import { createLogger } from "@fincore/logger";
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";

const logger = createLogger("webhook:controller");

@Controller("webhook")
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * WAHA sends all events here.
   * This endpoint must:
   * 1. Validate signature
   * 2. Filter owner-only
   * 3. Return 200 IMMEDIATELY
   * 4. Process async (fire-and-forget)
   */
  @Post("whatsapp")
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookSignatureGuard, OwnerOnlyGuard)
  receive(@Body() payload: WahaWebhookPayload): { ok: boolean } {
    this.webhookService.handleIncoming(payload).catch((err: unknown) => {
      logger.error({ err, event: payload.event }, "Webhook processing error");
    });

    return { ok: true };
  }

  /**
   * Health check for WAHA to verify webhook URL is alive
   */
  @Post("whatsapp/ping")
  @HttpCode(HttpStatus.OK)
  ping(): { ok: boolean; ts: number } {
    return { ok: true, ts: Date.now() };
  }
}
