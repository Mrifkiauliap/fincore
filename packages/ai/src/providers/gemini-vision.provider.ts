import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { IVisionProvider, OcrResult } from "../interfaces";

const logger = createLogger("ai:gemini-vision");

const OCR_PROMPT = `
Ekstrak semua teks yang ada dalam gambar ini secara lengkap dan akurat.
Gambar ini kemungkinan berisi struk belanja, screenshot transaksi, QRIS, mutasi bank, atau invoice.

Tugas:
1. Ekstrak SEMUA teks yang terlihat
2. Pertahankan struktur dan format aslinya
3. Jika ada angka/nominal, pastikan akurat
4. Return hanya teks hasil ekstraksi, tanpa penjelasan tambahan
`.trim();

export class GeminiVisionProvider implements IVisionProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>;

  constructor() {
    const apiKey = getConfig("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async analyzeReceipt(
    imageBuffer: Buffer,
    mimetype: string,
  ): Promise<OcrResult> {
    logger.info(
      { bufferSize: imageBuffer.length, mimetype },
      "Analyzing image via Gemini Vision",
    );

    const result = await this.model.generateContent([
      OCR_PROMPT,
      {
        inlineData: {
          mimeType: mimetype as "image/jpeg" | "image/png" | "image/webp",
          data: imageBuffer.toString("base64"),
        },
      },
    ]);

    const extractedText = result.response.text();
    logger.info({ textLength: extractedText.length }, "OCR complete");

    return {
      extractedText,
      provider: "gemini-1.5-flash",
    };
  }
}
