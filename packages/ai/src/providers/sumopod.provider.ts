import getConfig from "@fincore/config";
import {
  AiExtractionOutput,
  AiMultiExtractionOutput,
  AiMultiExtractionOutputSchema,
} from "@fincore/contracts";
import { createLogger } from "@fincore/logger";
import axios from "axios";
import { ExtractionContext, IAiProvider } from "../interfaces";

const logger = createLogger("ai:sumopod");

function buildExtractionSystemPrompt(context?: ExtractionContext): string {
  let categoriesText = `
Kategori yang tersedia (gunakan slug ini):
expense: food, transport, shopping, health, entertainment, bills, education, investment_out, personal_care, household, other_expense
income: salary, freelance, business, investment_in, bonus, gift, selling, other_income
transfer: transfer_account, topup_ewallet, pay_debt, give_loan, transfer_with_fee`;

  let paymentMethodsText = `
Payment methods yang tersedia:
Tunai / Cash, GoPay, OVO, Dana, ShopeePay, LinkAja, QRIS, Transfer BCA, Transfer BNI, Transfer BRI, Transfer Mandiri, Kartu Kredit, Kartu Debit`;

  let tagsText = "";

  if (context) {
    // Gunakan format TOON (Token Oriented Object Notation) yang super hemat token
    categoriesText = `
Kategori (slugs):
expense: ${context.categories.expense.join(", ")}
income: ${context.categories.income.join(", ")}
transfer: ${context.categories.transfer.join(", ")}`;

    paymentMethodsText = `
Payment methods:
${context.paymentMethods.join(", ")}`;

    if (context.tags.length > 0) {
      tagsText = `
Tags:
${context.tags.join(", ")}`;
    }
  }

  return `
Kamu adalah sistem ekstraksi transaksi keuangan yang presisi untuk aplikasi FinCore.

Tugasmu: Ekstrak SEMUA transaksi keuangan dari pesan. Satu pesan bisa mengandung LEBIH DARI SATU transaksi.

Aturan:
- Return HANYA JSON, tidak ada teks lain sama sekali
- Pahami slang keuangan Indonesia: ceban=10000, gopek=500, 12k=12000, 50rb=50000, 1jt=1000000
- Jika tidak ada transaksi yang jelas dalam pesan, return array kosong dengan overall_confidence rendah
- ABAIKAN transaksi atau aktivitas yang tidak menyebutkan nominal/harga (amount) yang jelas
- Selalu tentukan type: expense, income, atau transfer
- fee: biaya admin/transfer (HANYA gunakan angka 0 jika tidak ada, DILARANG menggunakan null)
- total_amount: amount + fee (selalu hitung dengan benar)
- to_payment_method: WAJIB diisi untuk type=transfer, null untuk expense/income
- Jika ada BEBERAPA transaksi dalam satu pesan, ekstrak SEMUA (yang memiliki nominal) dan masukkan ke dalam array transactions
- name: Berikan judul singkat dan jelas untuk transaksi (misal: "Beli Shampo", "Isi Bensin", "Gaji Bulan Mei"). JANGAN gunakan nama panjang.
- tags: Ekstrak kata-kata yang diawali dengan hashtag (#) atau dari konteks spesifik sebagai tags. Hasilkan array of string. Contoh kalimat: "Makan siang 50rb #kantor #lembur" -> ["kantor", "lembur"]. JANGAN sertakan simbol # di dalam string array. Jika tidak ada, return array kosong [].
${categoriesText}
${paymentMethodsText}
${tagsText}
Format output JSON (SELALU array, bahkan untuk 1 transaksi):
{
  "transactions": [
    {
      "name": "judul singkat transaksi",
      "type": "expense|income|transfer",
      "amount": number (selalu positif),
      "fee": number (default 0),
      "total_amount": number (amount + fee),
      "currency": "kode mata uang 3 huruf (contoh: IDR, EUR, USD. Default: IDR)",
      "category": "slug dari daftar di atas",
      "merchant": "string atau null",
      "location": "string atau null",
      "tags": ["string1", "string2"],
      "payment_method": "nama payment method persis dari daftar di atas, atau null",
      "to_payment_method": "nama payment method tujuan (untuk transfer) atau null",
      "fee_note": "keterangan biaya tambahan atau null",
      "source_type": "text|voice|image",
      "notes": "string atau null",
      "confidence_score": number antara 0 dan 1
    }
  ],
  "overall_confidence": number antara 0 dan 1 (rata-rata confidence semua transaksi)
}
`.trim();
}

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

  /**
   * Ekstrak transaksi dari konten teks/transkripsi/OCR.
   * Selalu return array — bisa 1 atau lebih transaksi dari 1 pesan.
   */
  async extractTransaction(
    content: string,
    context?: ExtractionContext,
  ): Promise<AiExtractionOutput[]> {
    logger.info(
      { contentLength: content.length, hasContext: !!context },
      "Extracting transactions via Sumopod",
    );

    const systemPrompt = buildExtractionSystemPrompt(context);

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        temperature: 0.1,
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

    // Validate via multi-extraction schema
    const validated: AiMultiExtractionOutput =
      AiMultiExtractionOutputSchema.parse(parsed);

    logger.info(
      {
        count: validated.transactions.length,
        overallConfidence: validated.overall_confidence,
      },
      "Extraction complete",
    );

    return validated.transactions;
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
              "Kamu adalah penasihat keuangan personal (FinCore). Berikan 1-2 kalimat insight, motivasi, atau saran penghematan yang bersahabat berdasarkan laporan keuangan berikut. Jangan ulangi angka-angkanya secara mentah, fokus pada maknanya (contoh: 'Pengeluaran transportasimu cukup besar minggu ini'). Gunakan bahasa Indonesia santai tapi profesional.",
          },
          {
            role: "user",
            content: `Ini laporan keuanganku:\n\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 128,
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
