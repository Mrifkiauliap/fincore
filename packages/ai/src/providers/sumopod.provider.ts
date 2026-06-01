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

/**
 * Deskripsi semantik per slug kategori — digunakan untuk memberikan
 * panduan klasifikasi ke AI agar tidak default ke "other_expense"/"other_income".
 */
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  // Expense
  food: "makanan & minuman (misal: makan siang, beli kopi, sarapan, nasi padang, jajan, beli cemilan, delivery food, restoran)",
  transport:
    "bensin, parkir, tol, angkutan umum, ojek, taksi, kendaraan, servis motor/mobil (misal: isi bensin, naik gojek, bayar tol, bensin motor, parkir)",
  shopping:
    "belanja barang: baju, sepatu, tas, elektronik, hadiah, oleh-oleh, mainan, aksesoris (misal: beli baju, beli sepatu, beli kado, beli hp)",
  health:
    "dokter, obat, rumah sakit, apotek, asuransi kesehatan, vitamin, cek lab (misal: beli obat, ke dokter, bayar resep)",
  entertainment:
    "hiburan, nonton, game, liburan, rekreasi, streaming, hobi, konser, bioskop (misal: nonton bioskop, langganan Netflix, tiket konser, top up game, jalan-jalan)",
  bills:
    "tagihan & iuran: listrik, air, pulsa, paket data, internet, sewa/kost, iuran bulanan, pajak, cicilan (misal: bayar listrik, beli pulsa, bayar wifi, bayar kost, token listrik, bayar BPJS)",
  education:
    "kursus, buku, uang sekolah, pelatihan, bootcamp, les/privat (misal: beli buku kuliah, bayar spp, bayar les, langganan kursus online)",
  investment_out:
    "investasi keluar: beli saham, reksadana, crypto, emas, deposito, obligasi (misal: beli saham, top up reksadana, beli emas batangan)",
  personal_care:
    "perawatan diri: salon, barbershop, skincare, makeup, gym, fitness, spa, pijat (misal: potong rambut, facial, beli skincare, gym membership, cukur)",
  household:
    "rumah tangga: perabotan, perbaikan rumah, alat dapur, dekorasi, perlengkapan rumah, bahan bangunan (misal: beli panci, perbaiki atap, beli sapu, beli lampu, beli sprei)",
  other_expense:
    "HANYA untuk pengeluaran yang BENAR-BENAR TIDAK cocok dengan kategori expense di atas. JANGAN gunakan ini sebagai shortcut.",

  // Income
  salary:
    "gaji tetap bulanan dari pekerjaan utama (misal: gajian, terima gaji, gaji bulan ini, salary)",
  freelance:
    "pendapatan dari proyek/freelance lepas (misal: proyek desain, jasa coding, terjemahan, foto, nge-MC)",
  business:
    "pendapatan dari bisnis/usaha sendiri (misal: hasil jualan, omset toko, untung dagang, catering)",
  investment_in:
    "pendapatan dari investasi: dividen, bunga deposito, capital gain, kupon obligasi (misal: dividen saham, bunga deposito, profit crypto)",
  bonus:
    "bonus, THR, insentif, komisi, uang lembur (misal: bonus tahunan, THR, komisi penjualan, insentif)",
  gift: "hadiah, hibah, sumbangan, uang amplop, angpao, warisan (misal: dapat hadiah, dikasih uang, angpao lebaran)",
  selling:
    "hasil jual barang pribadi/bekas, garasi sale, jual aset (misal: jual hp bekas, jual motor, jual barang bekas)",
  other_income:
    "HANYA untuk pemasukan yang BENAR-BENAR TIDAK cocok dengan kategori income di atas. JANGAN gunakan ini sebagai shortcut.",

  // Transfer
  transfer_account:
    "transfer antar rekening bank sendiri (misal: tf ke BCA, pindahin ke Mandiri, transfer antar rekening)",
  topup_ewallet:
    "top up / isi saldo e-wallet (misal: top up GoPay, isi OVO, top up Dana, top up ShopeePay)",
  pay_debt:
    "bayar utang / bayar kembali pinjaman ke orang lain (misal: bayar utang, balikin uang pinjaman, bayar tagihan pinjol)",
  give_loan:
    "memberi pinjaman ke orang lain / patungan (misal: kasih pinjem, minjemin duit, transfer pinjaman / patungan bareng beli sesuatu)",
  transfer_with_fee:
    "transfer yang dikenai biaya admin (misal: tf kena admin, transfer antar bank kena biaya)",
};

function buildCategoryGuide(context?: ExtractionContext): string {
  const lines: string[] = [];
  lines.push("PANDUAN KLASIFIKASI KATEGORI (WAJIB DIIKUTI):");

  const addTypeGuide = (slugs: string[]) => {
    for (const slug of slugs) {
      const desc = CATEGORY_DESCRIPTIONS[slug];
      if (desc) {
        lines.push(`  - ${slug}: ${desc}`);
      }
    }
  };

  if (context) {
    if (context.categories.expense.length > 0) {
      lines.push("");
      lines.push("[EXPENSE]");
      addTypeGuide(context.categories.expense);
    }
    if (context.categories.income.length > 0) {
      lines.push("");
      lines.push("[INCOME]");
      addTypeGuide(context.categories.income);
    }
    if (context.categories.transfer.length > 0) {
      lines.push("");
      lines.push("[TRANSFER]");
      addTypeGuide(context.categories.transfer);
    }
  } else {
    // Fallback: semua slug default
    const allExpense = [
      "food",
      "transport",
      "shopping",
      "health",
      "entertainment",
      "bills",
      "education",
      "investment_out",
      "personal_care",
      "household",
      "other_expense",
    ];
    const allIncome = [
      "salary",
      "freelance",
      "business",
      "investment_in",
      "bonus",
      "gift",
      "selling",
      "other_income",
    ];
    const allTransfer = [
      "transfer_account",
      "topup_ewallet",
      "pay_debt",
      "give_loan",
      "transfer_with_fee",
    ];

    lines.push("");
    lines.push("[EXPENSE]");
    addTypeGuide(allExpense);
    lines.push("");
    lines.push("[INCOME]");
    addTypeGuide(allIncome);
    lines.push("");
    lines.push("[TRANSFER]");
    addTypeGuide(allTransfer);
  }

  lines.push("");
  lines.push("ATURAN KLASIFIKASI KRITIS:");
  lines.push(
    "1. Klasifikasikan berdasarkan BARANG/JASA yang dibeli, BUKAN berdasarkan siapa yang membayar atau konteks sosialnya.",
  );
  lines.push(
    '2. "patungan bareng temen buat beli baju" > shopping (yang dibeli adalah baju).',
  );
  lines.push(
    '3. "beliin temen makan siang 50rb" > food (yang dibeli adalah makanan).',
  );
  lines.push(
    '4. "aku bayarin bensin temen 100rb" > transport (yang dibeli adalah bensin).',
  );
  lines.push(
    '5. "transfer uang buat patungan" (tanpa menyebut barang) > transfer/give_loan.',
  );
  lines.push('6. "Beli makanan buat temen" > food, BUKAN gift.');
  lines.push('7. "Beli kado buat temen" > shopping, BUKAN gift.');
  lines.push(
    '8. "other_expense" dan "other_income" HANYA digunakan jika BENAR-BENAR tidak ada kategori yang cocok. JANGAN gunakan sebagai default atau shortcut!',
  );

  return lines.join("\n");
}

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

  const categoryGuide = buildCategoryGuide(context);

  const todayStr = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });

  return `
Kamu adalah sistem ekstraksi transaksi keuangan yang presisi untuk aplikasi FinCore.

Konteks Waktu Saat Ini: ${todayStr} (WIB)

Tugasmu: Ekstrak SEMUA transaksi keuangan dari pesan. Satu pesan bisa mengandung LEBIH DARI SATU transaksi.

${categoryGuide}

Aturan Umum:
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
- transaction_date: Jika user menyebutkan waktu (contoh: "kemarin", "tadi pagi", "tanggal 10"), hitung dan format ke "YYYY-MM-DD HH:mm:ss". Jika tidak disebutkan, kembalikan null.
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
      "transaction_date": "YYYY-MM-DD HH:mm:ss atau null",
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
   * Selalu return array - bisa 1 atau lebih transaksi dari 1 pesan.
   */
  async extractTransaction(
    content: string,
    context?: ExtractionContext,
  ): Promise<{
    raw: string;
    parsed: AiExtractionOutput[];
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    logger.info(
      { contentLength: content.length, hasContext: !!context },
      "Extracting transactions via Sumopod",
    );

    const systemPrompt = buildExtractionSystemPrompt(context);

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: getConfig("AI_EXTRACTION_MODEL"),
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
    const apiUsage = response.data.usage;

    let usage;
    if (apiUsage) {
      usage = {
        inputTokens: apiUsage.prompt_tokens ?? 0,
        outputTokens: apiUsage.completion_tokens ?? 0,
      };
    }

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

    return { raw, parsed: validated.transactions, usage };
  }

  async generateSummary(data: unknown): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: getConfig("AI_SUMMARY_MODEL"),
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
        max_tokens: 100,
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
