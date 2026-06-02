import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { IVisionProvider, OcrResult } from "../interfaces";

const logger = createLogger("ai:gemini-vision");

/**
 * Prompt OCR yang dioptimalkan untuk dokumen keuangan Indonesia:
 * struk belanja, screenshot mutasi bank, QRIS, invoice, nota, dsb.
 *
 * Tujuan: menghasilkan teks terstruktur yang bisa diproses dengan akurat
 * oleh AI extraction (SumopodProvider) di downstream.
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

export class GeminiVisionProvider implements IVisionProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor() {
    const apiKey = getConfig("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({
      model: getConfig("AI_VISION_MODEL"),
      // Gemini 2.5 Flash supports controlled generation;
      // temperature 0 = deterministic OCR output
      generationConfig: {
        temperature: 0,
        topP: 1,
        topK: 1,
      },
    });
  }

  /**
   * Analisis gambar struk/dokumen keuangan dan ekstrak teks via Gemini Vision.
   *
   * MIME types yang didukung Gemini:
   * - image/jpeg
   * - image/png
   * - image/webp
   * - application/pdf
   */
  async analyzeReceipt(
    imageBuffer: Buffer,
    mimetype: string,
  ): Promise<OcrResult> {
    logger.info(
      { bufferSize: imageBuffer.length, mimetype },
      "Analyzing image via Gemini Vision",
    );

    // Validasi & normalisasi MIME type untuk Gemini
    const supportedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ] as const;

    const normalizedMimeType = supportedMimeTypes.includes(mimetype as any)
      ? mimetype
      : "image/jpeg"; // fallback ke JPEG

    const start = Date.now();

    const result = await this.model.generateContent([
      OCR_PROMPT,
      {
        inlineData: {
          mimeType: normalizedMimeType as (typeof supportedMimeTypes)[number],
          data: imageBuffer.toString("base64"),
        },
      },
    ]);

    const extractedText = result.response.text();
    const latencyMs = Date.now() - start;

    logger.info(
      {
        textLength: extractedText.length,
        latencyMs,
        mimetype: normalizedMimeType,
      },
      "OCR complete",
    );

    return {
      extractedText,
      provider: getConfig("AI_VISION_MODEL"),
      // Gemini tidak memberikan confidence score native untuk OCR,
      // jadi kita biarkan undefined -downstream akan menghitung
      // confidence dari AI extraction.
      confidence: undefined,
    };
  }
}
