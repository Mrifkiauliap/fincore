import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import axios from "axios";

const logger = createLogger("ai:guardrail");

export enum MessageIntent {
  LOG_TRANSACTION = "LOG_TRANSACTION", // "beli makan 25rb gopay"
  QUERY_REPORT = "QUERY_REPORT", // "berapa pengeluaranku bulan ini?"
  COMMAND = "COMMAND", // "hapus terakhir", "bantuan"
  GREETING = "GREETING", // "halo", "pagi"
  OUT_OF_SCOPE = "OUT_OF_SCOPE", // "cuaca hari ini?", "buat puisi"
  CONFIRMATION_REPLY = "CONFIRMATION_REPLY", // "ya", "oke", "tidak", "batal"
  SETUP_RECURRING = "SETUP_RECURRING", // "ingetin bayar listrik tanggal 20"
}

export interface IntentResult {
  intent: MessageIntent;
  confidence: number;
  reason: string;
  extractedQuery?: string; // untuk QUERY_REPORT: query yang bersih
  ackMessage?: string; // untuk pesan loading yg spesifik (hanya untuk QUERY_REPORT)
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const GUARDRAIL_SYSTEM_PROMPT = `
Kamu adalah classifier intent untuk aplikasi pencatat keuangan personal berbasis WhatsApp bernama FinCore.
FinCore HANYA menangani hal-hal berikut:
1. Pencatatan transaksi keuangan (pengeluaran, pemasukan, transfer)
2. Query laporan keuangan pribadi ("berapa pengeluaranku...", "rangkum bulan ini...")
3. Command aplikasi (hapus, bantuan, laporan harian/mingguan/bulanan)
4. Sapaan singkat

FinCore TIDAK menangani:
- Pertanyaan umum (cuaca, berita, resep, jadwal, dsb)
- Pembuatan konten (puisi, cerita, esai, dsb)
- Percakapan non-keuangan
- Informasi yang tidak berkaitan dengan keuangan pribadi user ini

Klasifikasikan pesan berikut ke salah satu intent:
- LOG_TRANSACTION: user mencatat transaksi (beli, bayar, terima uang, transfer, dll)
- QUERY_REPORT: user bertanya tentang keuangannya (berapa, rangkum, lihat, cek saldo)
- COMMAND: perintah eksplisit (hapus, laporan, kategori, bantuan, help)
- GREETING: sapaan biasa (halo, hai, pagi, selamat)
- CONFIRMATION_REPLY: jawaban ya/tidak untuk konfirmasi transaksi (ya, oke, tidak, batal, benar, salah)
- SETUP_RECURRING: setup pengingat tagihan berulang (ingetin, reminder, tagihan setiap, bayar rutin)
- OUT_OF_SCOPE: apapun di luar keuangan pribadi

Return HANYA JSON:
{
  "intent": "LOG_TRANSACTION" | "QUERY_REPORT" | "COMMAND" | "GREETING" | "CONFIRMATION_REPLY" | "SETUP_RECURRING" | "OUT_OF_SCOPE",
  "confidence": 0.0-1.0,
  "reason": "alasan singkat dalam Bahasa Indonesia",
  "extracted_query": "string atau null (hanya untuk QUERY_REPORT: versi bersih query)",
  "short_ack_message": "string (opsional, hanya untuk QUERY_REPORT. Contoh: 'Sedang mengecek pengeluaran bulan ini...', 'Sedang merekap saldo...', dll. Tanpa emoji.)"
}
`.trim();

// ─── Guardrail Service ────────────────────────────────────────────────────────
export class FinanceGuardrail {
  private readonly http = axios.create({
    baseURL: getConfig("SUMOPOD_BASE_URL"),
    headers: {
      Authorization: `Bearer ${getConfig("SUMOPOD_API_KEY")}`,
      "Content-Type": "application/json",
    },
    timeout: 10_000,
  });

  private readonly triggerPrefix = getConfig("FINCORE_TRIGGER_PREFIX") ?? "";

  async detectIntent(message: string): Promise<IntentResult> {
    logger.debug({ message }, "Detecting intent");

    const fastResult = this.detectCommandFastPath(message);
    if (fastResult) return fastResult;

    try {
      const res = await this.http.post("/chat/completions", {
        model: getConfig("AI_CLASSIFICATION_MODEL"), // Model termurah, untuk classification
        messages: [
          { role: "system", content: GUARDRAIL_SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        temperature: 0,
        max_tokens: 168,
        response_format: { type: "json_object" },
      });

      const raw = JSON.parse(res.data.choices[0].message.content);

      const result: IntentResult = {
        intent: raw.intent as MessageIntent,
        confidence: raw.confidence ?? 0.8,
        reason: raw.reason ?? "",
        extractedQuery: raw.extracted_query ?? undefined,
        ackMessage: raw.short_ack_message ?? undefined,
      };

      logger.info(
        { intent: result.intent, confidence: result.confidence },
        "Intent detected",
      );
      return result;
    } catch (err) {
      logger.warn({ err }, "Guardrail failed, defaulting to LOG_TRANSACTION");
      return {
        intent: MessageIntent.LOG_TRANSACTION,
        confidence: 0.5,
        reason: "Guardrail error - fail open",
      };
    }
  }

  isAllowed(intent: MessageIntent): boolean {
    return intent !== MessageIntent.OUT_OF_SCOPE;
  }

  getOutOfScopeReply(): string {
    return (
      "🤖 Maaf, FinCore hanya bisa membantu urusan keuangan pribadi kamu.\n\n" +
      "Yang bisa aku lakukan:\n" +
      "• Catat pengeluaran, pemasukan, atau transfer\n" +
      "• Jawab pertanyaan tentang keuanganmu\n" +
      "• Kirim laporan harian/mingguan/bulanan\n\n" +
      `Kirim ${this.triggerPrefix}bantuan untuk melihat panduan lengkap.`
    );
  }

  // ─── Fast-path command detection (no AI needed) ───────────────────────────
  private detectCommandFastPath(message: string): IntentResult | null {
    const lower = message.toLowerCase().trim();

    // ── Confirmation replies (highest priority) ───────────────────────────────
    const confirmPositive = [
      "ya",
      "iya",
      "oke",
      "ok",
      "benar",
      "betul",
      "yes",
      "yep",
      "simpan",
      "konfirmasi",
      "yoi",
    ];
    const confirmNegative = [
      "tidak",
      "enggak",
      "gak",
      "nggak",
      "gk",
      "batal",
      "cancel",
      "salah",
      "no",
      "nope",
      "hapus saja",
    ];

    if (confirmPositive.includes(lower)) {
      return {
        intent: MessageIntent.CONFIRMATION_REPLY,
        confidence: 1.0,
        reason: "Positive confirmation reply",
        extractedQuery: "yes",
      };
    }
    if (confirmNegative.includes(lower)) {
      return {
        intent: MessageIntent.CONFIRMATION_REPLY,
        confidence: 1.0,
        reason: "Negative confirmation reply",
        extractedQuery: "no",
      };
    }

    // ── Recurring setup fast-path ─────────────────────────────────────────────
    const recurringKeywords = [
      "ingetin",
      "pengingat",
      "ingatkan",
      "reminder",
      "tagihan setiap",
      "bayar rutin",
      "bayar setiap",
    ];
    if (
      recurringKeywords.some((k) => lower.startsWith(k) || lower.includes(k))
    ) {
      return {
        intent: MessageIntent.SETUP_RECURRING,
        confidence: 0.95,
        reason: "Recurring bill setup detected",
      };
    }

    // ── Explicit commands ─────────────────────────────────────────────────────
    const commands = [
      this.triggerPrefix + "laporan",
      this.triggerPrefix + "report",
      this.triggerPrefix + "hapus",
      this.triggerPrefix + "delete",
      this.triggerPrefix + "kategori",
      this.triggerPrefix + "category",
      this.triggerPrefix + "bantuan",
      this.triggerPrefix + "help",
      this.triggerPrefix + "tagihan",
      this.triggerPrefix + "summary",
      this.triggerPrefix + "budget",
      this.triggerPrefix + "konfirmasi",
      this.triggerPrefix + "tambah",
      this.triggerPrefix + "lihat",
      this.triggerPrefix + "atur",
      this.triggerPrefix + "settings",
    ];

    if (commands.some((cmd) => lower.startsWith(cmd))) {
      return {
        intent: MessageIntent.COMMAND,
        confidence: 1.0,
        reason: "Explicit command detected",
      };
    }

    const greetings = [
      "halo",
      "hai",
      "hi",
      "hello",
      "pagi",
      "siang",
      "sore",
      "malam",
      "hei",
    ];
    if (greetings.some((g) => lower === g || lower.startsWith(g + " "))) {
      return {
        intent: MessageIntent.GREETING,
        confidence: 0.95,
        reason: "Greeting detected",
      };
    }

    return null;
  }
}
