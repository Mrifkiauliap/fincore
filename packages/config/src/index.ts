import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";

// Find and load the nearest .env file walking up from process.cwd() or __dirname
function loadEnv() {
  const searchDirs = [process.cwd(), __dirname];

  for (let currentDir of searchDirs) {
    while (currentDir) {
      const envPath = path.join(currentDir, ".env");
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        return;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  APP_PORT: z.coerce.number().default(3000),
  APP_SECRET: z.string().min(1),
  LOG_LEVEL: z.string().default("info"),

  // Database
  DATABASE_URL: z.string().url(),

  // Valkey
  VALKEY_URL: z.string().default("redis://localhost:6379"),
  VALKEY_HOST: z.string().default("localhost"),
  VALKEY_PORT: z.coerce.number().default(6379),

  // WAHA
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  WAHA_SESSION: z.string().default("default"),
  WAHA_WEBHOOK_HMAC_KEY: z.string().optional(),

  // AI
  SUMOPOD_API_KEY: z.string().min(1),
  SUMOPOD_BASE_URL: z.string().url(),

  // Transcription
  GROQ_API_KEY: z.string().optional(),

  // OCR / Vision
  GEMINI_API_KEY: z.string().optional(),

  // Bull Board
  BULL_BOARD_USERNAME: z.string().default("admin"),
  BULL_BOARD_PASSWORD: z.string().default("admin123"),

  // Personal access control
  /** Only this WA number is processed. Others are silently ignored. Format: 628xxxxxxxxxx */
  OWNER_PHONE: z.string().optional(),
  /** Optional WhatsApp LID (Linked Device ID) for privacy mode fallback */
  OWNER_LID: z.string().optional(),
  /**
   * Optional trigger prefix for multi-instance WA sharing.
   * E.g. "💰" > only messages starting with 💰 are processed by FinCore.
   * Leave empty to process all messages from OWNER_PHONE.
   */
  FINCORE_TRIGGER_PREFIX: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let _config: AppConfig;

export default function getConfig(): AppConfig;
export default function getConfig<K extends keyof AppConfig>(
  key: K,
): AppConfig[K];
export default function getConfig<K extends keyof AppConfig>(
  key?: K,
): AppConfig | AppConfig[K] {
  if (!_config) {
    // Load environment variables before parsing
    loadEnv();

    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
      console.error("❌ Invalid environment variables:");
      console.error(parsed.error.flatten().fieldErrors);
      process.exit(1);
    }

    _config = parsed.data;
  }

  if (key) return _config[key];
  return _config;
}
