import getConfig from "@fincore/config";
import { getDb, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

const logger = createLogger("guard:owner");

/**
 * Owner guard - allows only users registered in the `users` table.
 *
 * Checks the sender's WhatsApp number against the users table.
 * Unregistered senders are silently ignored (403 > WAHA retries are suppressed
 * because the controller always returns 200 after the guard passes).
 *
 * For the very first use, the owner must be seeded into the users table manually
 * or via an onboarding flow.
 *
 * Dev mode: if no users exist in DB, falls back to OWNER_PHONE env var for
 * bootstrapping so you don't get locked out during initial setup.
 */
@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const payload = req.body;

    if (payload?.event !== "message") {
      return true;
    }

    const senderRaw: string = payload?.payload?.from ?? "";
    const normalize = (p: string) => p.replace(/\D/g, "");
    const senderPhone = normalize(senderRaw);

    if (!senderPhone) {
      logger.warn("Could not extract sender phone from payload");
      return false;
    }

    try {
      const db = getDb();

      const [user] = await db
        .select({ id: users.id, phone: users.phone, isActive: users.isActive })
        .from(users)
        .where(eq(users.phone, senderPhone))
        .limit(1);

      if (user) {
        if (!user.isActive) {
          logger.warn(
            { phone: senderPhone },
            "Inactive user - message ignored",
          );
          return false;
        }
        return true;
      }

      const ownerPhone = normalize(getConfig("OWNER_PHONE") ?? "");
      const ownerLid = normalize(getConfig("OWNER_LID") ?? "");

      if (
        (ownerPhone && senderPhone === ownerPhone) ||
        (ownerLid && senderPhone === ownerLid)
      ) {
        logger.warn(
          { phone: senderPhone },
          "User not in DB but matches OWNER_PHONE/OWNER_LID - bootstrap mode, allowing",
        );
        return true;
      }

      logger.debug({ phone: senderPhone }, "Unknown sender - silently ignored");
      return false;
    } catch (err) {
      logger.error({ err }, "DB error in OwnerOnlyGuard, falling back to env");
      const ownerPhone = normalize(getConfig("OWNER_PHONE") ?? "");
      const ownerLid = normalize(getConfig("OWNER_LID") ?? "");
      return (
        (!!ownerPhone && senderPhone === ownerPhone) ||
        (!!ownerLid && senderPhone === ownerLid)
      );
    }
  }
}
