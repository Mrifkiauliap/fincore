import { FinanceGuardrail } from "@fincore/ai";
import { getDb, rawMessages } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { StorageProvider } from "@fincore/storage";
import { eq } from "drizzle-orm";

const logger = createLogger("processor:ocr-guardrail");

/**
 * Check OCR result against guardrail. If out of scope, reject & clean up.
 * Returns true if allowed, false if rejected.
 */
export async function checkGuardrail(
  rawMessageId: string,
  chatId: string,
  storagePath: string,
  fullContent: string,
): Promise<boolean> {
  const db = getDb();
  const storageProvider = new StorageProvider();
  const guardrail = new FinanceGuardrail();

  const intentResult = await guardrail.detectIntent(fullContent);

  if (!guardrail.isAllowed(intentResult.intent)) {
    logger.info(
      { rawMessageId, intent: intentResult.intent },
      "OCR result is out of scope, rejecting and deleting media",
    );

    await storageProvider.deleteMedia(storagePath);

    await db
      .update(rawMessages)
      .set({
        processingStatus: "failed",
        storagePath: null,
        processingError: "Out of scope image/document",
      })
      .where(eq(rawMessages.id, rawMessageId));

    await sendWaMessage(chatId, guardrail.getOutOfScopeReply());
    return false;
  }

  return true;
}
