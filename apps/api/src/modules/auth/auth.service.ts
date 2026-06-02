import { DRIZZLE } from "@/modules/database/database.module";
import getConfig from "@fincore/config";
import { getDb, sessions, users } from "@fincore/db";
import { enqueue } from "@fincore/queue";
import { JobName, QueueName } from "@fincore/shared";
import { Inject, Injectable } from "@nestjs/common";
import crypto from "crypto";
import { eq } from "drizzle-orm";

@Injectable()
export class AuthService {
  constructor(@Inject(DRIZZLE) private readonly db: ReturnType<typeof getDb>) {}

  /**
   * Cek apakah user sudah terdaftar di database.
   * Mengembalikan true jika sudah terdaftar, false jika belum.
   */
  async checkUser(phone: string): Promise<typeof users.$inferSelect | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    return user || null;
  }

  /**
   * Meng-handle registrasi user jika belum terdaftar.
   */
  async handleUnregisteredUser(
    phone: string,
    chatId: string,
    isRegisterCommand: boolean,
    commandText: string,
  ): Promise<void> {
    if (isRegisterCommand) {
      await enqueue(
        QueueName.SETTINGS_COMMAND,
        JobName.PROCESS_SETTINGS_COMMAND,
        {
          chatId,
          senderPhone: phone,
          commandText,
        },
      );
    } else {
      const { sendWaMessage } = await import("@fincore/queue");
      const triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";
      await sendWaMessage(
        chatId,
        `👋 Halo! Kamu belum terdaftar di FinCore.\n\nSilakan daftar terlebih dahulu dengan mengetik:\n*${triggerPrefix}daftar*`,
        undefined,
      );
    }
  }

  /**
   * Membuat magic link untuk user dan menyimpan hash-nya ke database.
   * Mengembalikan URL utuh yang siap dikirim ke user via WhatsApp.
   */
  async generateMagicLink(userId: string): Promise<string> {
    // Generate a secure 48-byte token
    const token = crypto.randomBytes(48).toString("base64url");
    // Hash the token before storing it to DB (Security enhancement)
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const expiresAt = new Date(Date.now() + 300000); // 5 minutes

    await this.db.insert(sessions).values({
      id: crypto.randomUUID(), // Temp session ID
      userId,
      magicToken: hashedToken,
      magicTokenExpiresAt: expiresAt,
      expiresAt,
    });

    const dashboardUrl = getConfig("DASHBOARD_URL");
    return `${dashboardUrl}/api/auth/verify?token=${token}`;
  }
}
