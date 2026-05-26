import {
  AiExtractionOutput,
  AiExtractionOutputSchema,
} from "@fincore/contracts";
import { createLogger } from "@fincore/logger";
import axios from "axios";
import { IAiProvider } from "../interfaces";

const logger = createLogger("ai:sumopod");

const EXTRACTION_SYSTEM_PROMPT = `
Kamu adalah sistem ekstraksi transaksi keuangan yang presisi.

Tugasmu: Ekstrak data transaksi dari pesan keuangan informal dalam Bahasa Indonesia.

Aturan:
- Return HANYA JSON, tidak ada teks lain sama sekali
- Pahami slang keuangan Indonesia: ceban=10000, gopek=500, 12k=12000, 50rb=50000
- Payment methods: GoPay, OVO, Dana, QRIS, ShopeePay, Transfer, Tunai/Cash
- Jika tidak ada transaksi dalam pesan, return confidence_score di bawah 0.3
- Selalu tentukan type: expense, income, atau transfer

Format output JSON:
{
  "type": "expense|income|transfer",
  "amount": number,
  "currency": "IDR",
  "category": "Food|Transport|Shopping|Health|Entertainment|Bills|Education|Investment|Salary|Other",
  "merchant": "string or null",
  "location": "string or null",
  "payment_method": "string or null",
  "source_type": "text|voice|image",
  "notes": "string or null",
  "confidence_score": number between 0 and 1
}
`.trim();

export class SumopodProvider implements IAiProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.SUMOPOD_BASE_URL!;
    this.apiKey = process.env.SUMOPOD_API_KEY!;
  }

  async extractTransaction(content: string): Promise<AiExtractionOutput> {
    logger.info(
      { contentLength: content.length },
      "Extracting transaction via Sumopod",
    );

    const response = await axios.post(
      `${this.baseUrl}/v1/chat/completions`,
      {
        model: "gpt-4o-mini", // adjust to Sumopod's model name
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content },
        ],
        temperature: 0.1, // low temp = deterministic
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const raw = response.data.choices[0].message.content;
    const parsed = JSON.parse(raw);
    const validated = AiExtractionOutputSchema.parse(parsed);

    logger.info(
      { confidence: validated.confidence_score },
      "Extraction complete",
    );
    return validated;
  }

  async generateSummary(data: unknown): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/v1/chat/completions`,
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah asisten keuangan personal. Buat ringkasan keuangan yang informatif dan mudah dipahami dalam Bahasa Indonesia.",
          },
          {
            role: "user",
            content: `Buat ringkasan dari data berikut:\n${JSON.stringify(data, null, 2)}`,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.choices[0].message.content as string;
  }
}
