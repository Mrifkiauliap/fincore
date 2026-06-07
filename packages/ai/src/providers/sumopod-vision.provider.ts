import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import axios from "axios";
import { IVisionProvider, OcrResult } from "../interfaces";

const logger = createLogger("ai:sumopod-vision");

/**
 * Prompt OCR yang dioptimalkan untuk dokumen keuangan Indonesia.
 * Sama persis dengan prompt Gemini Vision untuk konsistensi output.
 */
const OCR_PROMPT = `Kamu adalah sistem OCR presisi untuk dokumen keuangan Indonesia.

Tugas: Ekstrak SEMUA teks dari gambar ini dengan struktur yang jelas.

Gambar ini bisa berupa salah satu dari:
- Struk belanja (Indomaret, Alfamart, supermarket, restoran, dll)
- Screenshot mutasi bank / mobile banking (BCA, Mandiri, BRI, BNI, dll)
- Bukti transfer atau pembayaran QRIS
- Invoice / tagihan (listrik, air, internet, pulsa, dll)
- Nota pembelian atau bon

ATURAN EKSTRAKSI:
1. Ekstrak SEMUA teks yang terlihat, tidak boleh ada yang terlewat
2. Pertahankan struktur baris dan kolom semirip mungkin dengan aslinya
3. Nominal uang: tulis persis seperti yang tertera (contoh: "50.000", "12.500", "1.250.000")
4. Format Indonesia: perhatikan bahwa "Rp 50.000" = 50000 (bukan 50)
5. Tanggal: tulis lengkap (contoh: "12 Mei 2025" atau "2025-05-12")
6. Nama merchant/toko: tuliskan persis, termasuk jika ada singkatan
7. Metode pembayaran: jika terlihat (QRIS, Debit, Kredit, Tunai, GoPay, dll), tuliskan
8. Nomor referensi/transaksi: sertakan jika terlihat
9. Jika teks tidak jelas/terpotong, tulis "[?]" sebagai penanda

FORMAT OUTPUT:
- Return HANYA teks hasil ekstraksi
- JANGAN tambahkan penjelasan, analisis, atau komentar apapun
- Gunakan baris baru untuk memisahkan bagian yang berbeda
- Jika ada tabel (seperti daftar item di struk), pertahankan alignment dengan spasi
- Akhiri dengan baris: "--- OCR SELESAI ---"`;

/**
 * Fallback OCR provider via Sumopod (OpenAI-compatible API).
 * Digunakan saat Gemini Vision mengalami 503 atau circuit breaker open.
 *
 * Menggunakan GPT-4.1-nano sebagai default (termurah yang support vision).
 * Konfigurasi via AI_OCR_FALLBACK_MODEL di environment variable.
 */
export class SumopodVisionProvider implements IVisionProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = getConfig("SUMOPOD_BASE_URL") as string;
    this.apiKey = getConfig("SUMOPOD_API_KEY") as string;
    this.model =
      (getConfig("AI_OCR_FALLBACK_MODEL") as string) ?? "gpt-4.1-nano";
  }

  async analyzeReceipt(
    imageBuffer: Buffer,
    mimetype: string,
  ): Promise<OcrResult> {
    logger.info(
      {
        bufferSize: imageBuffer.length,
        mimetype,
        model: this.model,
      },
      "Analyzing image via Sumopod Vision (fallback)",
    );

    // Normalize MIME type untuk OpenAI vision format
    const normalizedMime = this.normalizeMimeForOpenAI(mimetype);
    const base64 = imageBuffer.toString("base64");
    const dataUri = `data:${normalizedMime};base64,${base64}`;

    const start = Date.now();

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: dataUri,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 4096,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const extractedText = response.data.choices[0].message.content as string;
    const latencyMs = Date.now() - start;

    logger.info(
      {
        textLength: extractedText.length,
        latencyMs,
        model: this.model,
        mimetype: normalizedMime,
      },
      "OCR complete via Sumopod Vision (fallback)",
    );

    return {
      extractedText,
      provider: `sumopod:${this.model}`,
      confidence: undefined,
    };
  }

  /**
   * OpenAI vision API hanya support: image/png, image/jpeg, image/webp (non-animated), image/gif
   * PDF tidak didukung langsung — harus dikonversi ke image dulu di upstream.
   */
  private normalizeMimeForOpenAI(
    mimetype: string,
  ): "image/jpeg" | "image/png" | "image/webp" {
    const supported = ["image/jpeg", "image/png", "image/webp"] as const;

    for (const mime of supported) {
      if (mimetype === mime) return mime;
    }

    // Fallback: application/pdf → convert to image was handled upstream by Sharp,
    // so the processBuffer is already JPEG at this point.
    // For unknown mime types, default to JPEG.
    return "image/jpeg";
  }
}
