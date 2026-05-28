import getConfig from "@fincore/config";
import type {
  FinancialEventType,
  WebhookSubscriptionContract,
} from "@fincore/contracts";
import { getDb, webhookSubscriptions } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import { eq } from "drizzle-orm";

const logger = createLogger("event-publisher:registry");

// 32-byte key for AES-256-GCM derived from APP_SECRET
const encryptionKey = scryptSync(getConfig("APP_SECRET"), "fincore_salt", 32);

/**
 * WebhookRegistryService — manages webhook subscriber registry.
 *
 * DB (`webhook_subscriptions`) is the source of truth.
 * Env vars are a bootstrap shortcut — they get upserted into DB at startup.
 *
 * Env var format:
 *   FINCORE_WEBHOOK_<NAME>=<url>|<secret>|<event_filter>
 *
 * Examples:
 *   FINCORE_WEBHOOK_FINANCE_CORE=https://finance.app/api/events|secret123|*
 *   FINCORE_WEBHOOK_SHEETS=https://script.google.com/...|secretxyz|transaction.created
 *   FINCORE_WEBHOOK_NOTIF=https://hooks.zapier.com/...|secretDEF|transaction.created,transaction.deleted
 *
 * Legacy support (backward compat):
 *   FINANCE_CORE_WEBHOOK_URL + FINANCE_CORE_WEBHOOK_SECRET → auto-register as "LEGACY"
 */
export class WebhookRegistryService {
  /**
   * Get all active subscribers for a given event type.
   * Includes subscribers with ['*'] (wildcard = all events).
   */
  async getActiveSubscribers(
    eventType: FinancialEventType,
  ): Promise<WebhookSubscriptionContract[]> {
    const db = getDb();

    // Query: is_active = true AND (event_types @> ARRAY['*'] OR event_types @> ARRAY[eventType])
    const rows = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.isActive, true));

    return rows
      .filter((row) => {
        const types = row.eventTypes ?? ["*"];
        return types.includes("*") || types.includes(eventType);
      })
      .map((row) => this.toContract(row));
  }

  /**
   * Called at app startup.
   * Reads FINCORE_WEBHOOK_<NAME> env vars and upserts them into DB.
   * If a subscription with the same name already exists in DB, it is NOT overwritten
   * (DB values take precedence — allows manual edits via DB without env override).
   */
  async bootstrapFromEnv(): Promise<void> {
    const subscriptions = this.parseEnvSubscriptions();

    if (subscriptions.length === 0) {
      logger.debug("No FINCORE_WEBHOOK_* env vars found, skipping bootstrap");
      return;
    }

    logger.info(
      { count: subscriptions.length },
      "Bootstrapping webhook subscriptions from env",
    );

    for (const sub of subscriptions) {
      try {
        await this.upsertByName(sub);
      } catch (err) {
        logger.error(
          { name: sub.name, err },
          "Failed to bootstrap webhook subscription",
        );
      }
    }
  }

  /**
   * Upsert a subscription by name.
   * If name already exists: skip (no overwrite).
   * If name does not exist: insert.
   */
  private async upsertByName(sub: {
    name: string;
    url: string;
    secret: string;
    eventTypes: string[];
  }): Promise<void> {
    const db = getDb();

    // ON CONFLICT DO NOTHING — existing rows win over env bootstrap
    await db
      .insert(webhookSubscriptions)
      .values({
        name: sub.name,
        url: sub.url,
        encryptedSecret: this.encryptSecret(sub.secret),
        eventTypes: sub.eventTypes,
        isActive: true,
      })
      .onConflictDoNothing({ target: webhookSubscriptions.name });

    logger.debug({ name: sub.name }, "Webhook subscription bootstrapped");
  }

  /**
   * Parse FINCORE_WEBHOOK_<NAME>=url|secret|filter env vars.
   * Also handles legacy FINANCE_CORE_WEBHOOK_URL + FINANCE_CORE_WEBHOOK_SECRET.
   */
  private parseEnvSubscriptions(): Array<{
    name: string;
    url: string;
    secret: string;
    eventTypes: string[];
  }> {
    const result: Array<{
      name: string;
      url: string;
      secret: string;
      eventTypes: string[];
    }> = [];

    // ── Parse FINCORE_WEBHOOK_<NAME>=url|secret|filter ────────────────────────
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith("FINCORE_WEBHOOK_") || !value) continue;

      const name = key.replace("FINCORE_WEBHOOK_", "");
      const parts = value.split("|");

      if (parts.length < 2) {
        logger.warn(
          { key },
          "Invalid FINCORE_WEBHOOK_* format. Expected: url|secret|filter",
        );
        continue;
      }

      const [url, secret, filter = "*"] = parts;

      if (!url || !secret) {
        logger.warn(
          { key },
          "Missing url or secret in FINCORE_WEBHOOK_* env var",
        );
        continue;
      }

      // Parse event filter: "*" or comma-separated event types
      const eventTypes =
        filter === "*" ? ["*"] : filter.split(",").map((e) => e.trim());

      result.push({
        name,
        url,
        secret,
        eventTypes,
      });
    }

    // ── Legacy: FINANCE_CORE_WEBHOOK_URL + FINANCE_CORE_WEBHOOK_SECRET ────────
    const legacyUrl = getConfig("FINANCE_CORE_WEBHOOK_URL");
    const legacySecret = getConfig("FINANCE_CORE_WEBHOOK_SECRET");
    if (legacyUrl && legacySecret) {
      logger.warn(
        "FINANCE_CORE_WEBHOOK_URL is legacy. Migrate to FINCORE_WEBHOOK_FINANCE_CORE=url|secret|*",
      );
      result.push({
        name: "LEGACY",
        url: legacyUrl,
        secret: legacySecret,
        eventTypes: ["*"],
      });
    }

    return result;
  }

  /**
   * Encrypt secret using AES-256-GCM before storing in DB.
   * Format: v1:iv:authTag:encryptedText
   */
  private encryptSecret(secret: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    let encrypted = cipher.update(secret, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt secret from DB back to plaintext for HMAC signing.
   */
  private decryptSecret(encrypted: string): string {
    if (!encrypted.startsWith("v1:")) {
      // Fallback for unencrypted legacy / dev secrets
      return encrypted;
    }

    try {
      const [, ivHex, authTagHex, encryptedHex] = encrypted.split(":");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(ivHex!, "hex"),
      );
      decipher.setAuthTag(Buffer.from(authTagHex!, "hex"));
      let decrypted = decipher.update(encryptedHex!, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      logger.error({ err }, "Failed to decrypt webhook secret");
      return "";
    }
  }

  private toContract(
    row: typeof webhookSubscriptions.$inferSelect,
  ): WebhookSubscriptionContract {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      secret: this.decryptSecret(row.encryptedSecret),
      eventTypes: (row.eventTypes ?? ["*"]) as FinancialEventType[] | ["*"],
      isActive: row.isActive,
      timeoutMs: row.timeoutMs,
      maxRetries: row.maxRetries,
      createdAt: row.createdAt,
      lastTriggeredAt: row.lastTriggeredAt,
      lastResponseStatus: row.lastResponseStatus,
    };
  }
}
