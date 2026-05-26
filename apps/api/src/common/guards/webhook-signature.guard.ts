import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";

const logger = createLogger("guard:webhook-signature");

/**
 * Validates WAHA webhook HMAC signature.
 *
 * WAHA sends two headers:
 *   X-Webhook-Hmac           – hex-encoded HMAC digest of the raw JSON body
 *   X-Webhook-Hmac-Algorithm – e.g. "sha512" (WAHA default)
 *
 * The shared secret is configured via WAHA_WEBHOOK_HMAC_KEY in both
 * WAHA's env and in this application's .env.
 *
 * If WAHA_WEBHOOK_HMAC_KEY is not set, validation is skipped (dev mode).
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = getConfig("WAHA_WEBHOOK_HMAC_KEY");

    if (!secret) return true;

    const req = context.switchToHttp().getRequest();
    const signature = req.headers["x-webhook-hmac"] as string | undefined;
    const algorithm =
      (req.headers["x-webhook-hmac-algorithm"] as string | undefined) ??
      "sha512";

    if (!signature) {
      logger.warn("Missing X-Webhook-Hmac header");
      return false;
    }

    const rawBody: Buffer =
      req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expected = createHmac(algorithm, secret)
      .update(rawBody)
      .digest("hex");

    let valid = false;
    try {
      valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      valid = false;
    }

    if (!valid) {
      logger.warn(
        { algorithm, signature, expected },
        "Invalid webhook HMAC signature",
      );
    }

    return valid;
  }
}
