import getConfig from "@fincore/config";
import { getDb, trackEvent, users } from "@fincore/db";
import { createLogger } from "@fincore/logger";
import { sendWaMessage } from "@fincore/queue";
import { eq } from "drizzle-orm";

const logger = createLogger("processor:incoming-welcome");

/**
 * Send welcome/onboarding message to new users and mark them as onboarded.
 */
export async function handleWelcomeMessage(
  userId: string,
  phone: string,
  chatId: string,
  userName: string,
): Promise<void> {
  const db = getDb();
  const prefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  const welcomeMessage =
    `Halo *${userName}*! Selamat datang di *FinCore* 🎉\n\n` +
    `Saya asisten keuangan pribadimu via WhatsApp.\n\n` +
    `Berikut cara menggunakannya:\n` +
    `💬 Ketik transaksi: _"Makan siang 35rb GoPay"_\n` +
    `🎤 Kirim voice note: _"Tadi bayar bensin 50 ribu"_\n` +
    `📸 Foto struk belanja dan kirimkan ke sini\n\n` +
    `Ketik ${prefix}bantuan untuk panduan lengkap.\n\n` +
    `Yuk mulai catat keuanganmu! 💪`;

  await sendWaMessage(chatId, welcomeMessage);

  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(eq(users.id, userId));

  trackEvent({
    category: "user",
    event: "user.onboarded",
    userId,
    metadata: { phone },
  }).catch(() => {});
}
