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
const GUARDRAIL_SYSTEM_PROMPT = [
  "Kamu adalah classifier intent untuk aplikasi pencatat keuangan personal berbasis WhatsApp bernama FinCore.",
  "",
  "FinCore HANYA menangani:",
  "1. Pencatatan transaksi keuangan (pengeluaran, pemasukan, transfer)",
  '2. Query laporan keuangan pribadi ("berapa pengeluaranku...", "rangkum bulan ini...")',
  "3. Command aplikasi (hapus, bantuan, laporan harian/mingguan/bulanan)",
  "4. Sapaan singkat",
  "5. Setup pengingat tagihan berulang",
  "",
  "FinCore TIDAK menangani:",
  "- Pertanyaan umum (cuaca, berita, resep, jadwal, dsb)",
  "- Pembuatan konten (puisi, cerita, esai, dsb)",
  "- Percakapan non-keuangan",
  "- Informasi yang tidak berkaitan dengan keuangan pribadi user",
  "",
  "PENTING -Klasifikasikan sebagai LOG_TRANSACTION untuk:",
  '- "patungan bareng temen buat beli baju" > tetap transaksi (yang dibeli adalah baju)',
  '- "beliin temen makan siang 50rb" > tetap transaksi (yang dibeli adalah makanan)',
  '- "aku bayarin bensin temen" > tetap transaksi (yang dibeli adalah bensin)',
  '- "transfer uang buat patungan" > tetap transaksi (konteksnya transfer)',
  "> Klasifikasikan berdasarkan ADA/TIDAKNYA nominal & aktivitas keuangan, BUKAN konteks sosialnya.",
  "",
  "Klasifikasikan pesan ke salah satu intent:",
  "- LOG_TRANSACTION: user mencatat transaksi -ada nominal + aktivitas beli/bayar/terima/transfer, termasuk patungan, beliin orang lain, atau nitip",
  "- QUERY_REPORT: user bertanya tentang kondisi keuangannya sendiri (berapa pengeluaran, rangkum, cek saldo, laporan, summary)",
  "- COMMAND: perintah eksplisit ke aplikasi (hapus, bantuan/help, atur, settings, lihat kategori)",
  "- GREETING: sapaan biasa TANPA ada nominal transaksi (halo, hai, pagi, selamat pagi/siang/sore/malam)",
  "- CONFIRMATION_REPLY: jawaban ya/tidak/setuju/batal untuk konfirmasi yang dikirim FinCore",
  "- SETUP_RECURRING: setup pengingat tagihan berulang (ingetin, reminder, tagihan setiap bulan, bayar rutin)",
  "- OUT_OF_SCOPE: apapun yang BENAR-BENAR di luar keuangan pribadi -tidak ada nominal, tidak ada query keuangan, bukan command",
  "",
  "Return HANYA JSON:",
  "{",
  '  "intent": "LOG_TRANSACTION",',
  '  "confidence": 0.95,',
  '  "reason": "alasan singkat dalam Bahasa Indonesia",',
  '  "extracted_query": null,',
  '  "short_ack_message": null',
  "}",
].join("\n");

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

    // ── Out-of-scope fast-path: catch jelas-jelas non-keuangan ───────────────
    const outOfScopePatterns = [
      // General knowledge / trivia
      /\b(cuaca|hujan|panas|cerah|mendung)\b.*\b(bagaimana|gimana|hari ini|besok)\b/i,
      /\b(resep|masak|goreng|rebus)\b.*\b(bagaimana|cara|gimana)\b/i,
      /\b(berita|news|headline|artikel)\b/i,
      // Content generation
      /\b(buat|buatin|tulis|tulisin)\b.*\b(puisi|cerita|sajak|pantun|cerpen|esai|lirik|lagu)\b/i,
      /\b(buat|buatin|tulis|tulisin)\b.*\b(kode|script|coding|program)\b/i,
      // Non-finance questions
      /\b(siapa|apa itu|kenapa|mengapa)\b.*\b(presiden|ibukota|planet|bintang|galaksi|sejarah|filosofi)\b/i,
      // Entertainment / random chat
      /\b(ceritain|dongeng|tebak|game|main|lucu)\b/i,
      // Religion / politics
      /\b(agama|politik|pemilu|partai|kandidat)\b/i,
    ];

    for (const pattern of outOfScopePatterns) {
      if (pattern.test(lower)) {
        logger.debug({ message }, "Fast-path OUT_OF_SCOPE detected");
        return {
          intent: MessageIntent.OUT_OF_SCOPE,
          confidence: 0.98,
          reason: "Fast-path: clearly non-financial content",
        };
      }
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
