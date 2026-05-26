import getConfig from "@fincore/config";
import {
  AiExtractionOutput,
  AiExtractionOutputSchema,
} from "@fincore/contracts";
import { createLogger } from "@fincore/logger";
import axios from "axios";
import { IAiProvider } from "../interfaces";

const logger = createLogger("ai:sumopod");

const EXTRACTION_SYSTEM_PROMPT = `
Kamu adalah sistem ekstraksi transaksi keuangan yang presisi untuk aplikasi FinCore.

Tugasmu: Ekstrak data transaksi dari pesan keuangan informal dalam Bahasa Indonesia.

Aturan:
- Return HANYA JSON, tidak ada teks lain sama sekali
- Pahami slang keuangan Indonesia: ceban=10000, gopek=500, 12k=12000, 50rb=50000, 1jt=1000000
- Jika tidak ada transaksi yang jelas dalam pesan, return confidence_score di bawah 0.3
- Selalu tentukan type: expense, income, atau transfer
- fee: biaya admin/transfer (default 0 jika tidak disebutkan)
- total_amount: amount + fee (selalu hitung dengan benar)
- to_payment_method: WAJIB diisi untuk type=transfer, null untuk expense/income

Kategori yang tersedia (gunakan slug ini):
expense: food, transport, shopping, health, entertainment, bills, education, investment_out, personal_care, household, other_expense
income: salary, freelance, business, investment_in, bonus, gift, selling, other_income
transfer: transfer_account, topup_ewallet, pay_debt, give_loan, transfer_with_fee

Payment methods yang tersedia:
Tunai / Cash, GoPay, OVO, Dana, ShopeePay, LinkAja, QRIS,
Transfer BCA, Transfer BNI, Transfer BRI, Transfer Mandiri, Kartu Kredit, Kartu Debit

Format output JSON:
{
  "type": "expense|income|transfer",
  "amount": number (selalu positif),
  "fee": number (default 0),
  "total_amount": number (amount + fee),
  "currency": "IDR",
  "category": "slug dari daftar di atas",
  "merchant": "string atau null",
  "location": "string atau null",
  "payment_method": "nama payment method persis dari daftar di atas, atau null",
  "to_payment_method": "nama payment method tujuan (untuk transfer) atau null",
  "fee_note": "keterangan biaya tambahan atau null",
  "source_type": "text|voice|image",
  "notes": "string atau null",
  "confidence_score": number antara 0 dan 1
}
`.trim();

export class SumopodProvider implements IAiProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    const apiKey = getConfig("SUMOPOD_API_KEY") as string;
    if (!apiKey) {
      throw new Error("SUMOPOD_API_KEY is not defined");
    }
    this.baseUrl = getConfig("SUMOPOD_BASE_URL") as string;
    this.apiKey = apiKey;
  }

  async extractTransaction(content: string): Promise<AiExtractionOutput> {
    logger.info(
      { contentLength: content.length },
      "Extracting transaction via Sumopod",
    );

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
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
      `${this.baseUrl}/chat/completions`,
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
