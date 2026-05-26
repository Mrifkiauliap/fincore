import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";

const logger = createLogger("sender:wa-send");

// Simulated typing speed: characters per second
const TYPING_CHARS_PER_SEC = 20;
const TYPING_DELAY_MIN_MS = 1_500;
const TYPING_DELAY_MAX_MS = 6_000;

function typingDelayMs(text: string): number {
  const estimated = (text.length / TYPING_CHARS_PER_SEC) * 1_000;
  return Math.min(
    Math.max(estimated, TYPING_DELAY_MIN_MS),
    TYPING_DELAY_MAX_MS,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendTextOptions {
  session: string;
  chatId: string;
  text: string;
  replyTo?: string;
}

/**
 * Thin HTTP wrapper around WAHA API for sending outbound messages.
 */
@Injectable()
export class WaSendService {
  private readonly http: AxiosInstance;
  private readonly session: string;

  /**
   * Per-chatId serial lock.
   * Ensures concurrent sendText() calls to the same chat are queued —
   * prevents typing indicator race conditions when multiple jobs land
   * for the same recipient at nearly the same time.
   */
  private readonly chatLocks = new Map<string, Promise<void>>();

  constructor() {
    this.session = getConfig("WAHA_SESSION");

    this.http = axios.create({
      baseURL: getConfig("WAHA_BASE_URL"),
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": getConfig("WAHA_API_KEY"),
      },
      timeout: 15_000,
    });
  }

  async startTyping(chatId: string): Promise<void> {
    try {
      await this.http.post("/api/startTyping", {
        chatId,
        session: this.session,
      });
      logger.debug({ chatId }, "Typing started");
    } catch (err) {
      // Non-fatal: some WAHA tiers may not support typing indicators
      logger.warn({ err, chatId }, "startTyping failed (non-fatal)");
    }
  }

  async stopTyping(chatId: string): Promise<void> {
    try {
      await this.http.post("/api/stopTyping", {
        chatId,
        session: this.session,
      });
      logger.debug({ chatId }, "Typing stopped");
    } catch (err) {
      logger.warn({ err, chatId }, "stopTyping failed (non-fatal)");
    }
  }

  // ─── Send Text ───────────────────────────────────────────────────────────────

  /**
   * Send a plain text message via WAHA.
   *
   * Flow (per chatId, serial): startTyping > delay > send > stopTyping
   *
   * Multiple calls to the same chatId are automatically queued so typing
   * indicators never overlap. Different chatIds run in parallel.
   *
   * @param chatId  WhatsApp chat ID, e.g. "628xxxxxxxxxx@c.us"
   * @param text    Message body
   * @param replyTo Optional waMessageId to reply to
   */
  async sendText(
    chatId: string,
    text: string,
    replyTo?: string,
  ): Promise<void> {
    const prev = this.chatLocks.get(chatId) ?? Promise.resolve();
    const next = prev.then(() => this._doSend(chatId, text, replyTo));

    this.chatLocks.set(
      chatId,
      next
        .catch(() => {})
        .finally(() => {
          if (this.chatLocks.get(chatId) === next) {
            this.chatLocks.delete(chatId);
          }
        }),
    );

    await next;
  }

  private async _doSend(
    chatId: string,
    text: string,
    replyTo?: string,
  ): Promise<void> {
    const session = this.session;
    const delay = typingDelayMs(text);

    logger.info(
      { chatId, session, textLength: text.length, delayMs: delay },
      "Sending text message",
    );

    await this.startTyping(chatId);
    await sleep(delay);

    const body: Record<string, unknown> = {
      chatId,
      text,
      session,
    };

    if (replyTo) {
      body["reply_to"] = replyTo;
    }

    try {
      await this.http.post(`/api/sendText`, body);
      logger.info({ chatId }, "Message sent ✅");
    } catch (err) {
      logger.error({ err, chatId }, "Failed to send message via WAHA");
      throw err;
    } finally {
      await this.stopTyping(chatId);
    }
  }
}
