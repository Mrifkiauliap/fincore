import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import Groq from "groq-sdk";
import { ITranscriptionProvider, TranscriptionResult } from "../interfaces";

const logger = createLogger("ai:groq-whisper");

/**
 * Prompt konteks untuk Whisper agar lebih akurat mentranskripsi
 * istilah keuangan Indonesia, slang nominal, dan akronim umum.
 *
 * Whisper menggunakan prompt ini sebagai "language model prior" —
 * kata/frasa yang muncul di prompt lebih mungkin dikenali dengan benar.
 */
const FINANCIAL_TRANSCRIPTION_PROMPT = [
  // Slang nominal Indonesia (sangat penting -salah transkripsi = salah amount)
  "ceban 10000",
  "gocap 50",
  "gopek 500",
  "seceng 1000",
  "goceng 5000",
  "ceban ceng 11000",
  "goban 50000",
  "cepek 100",

  // Akhiran nominal
  "rb ribu",
  "k",
  "jt juta",
  "M miliar",

  // Istilah transaksi umum
  "transfer",
  "top up",
  "isi saldo",
  "bayar",
  "beli",
  "jajan",
  "makan siang",
  "sarapan",
  "ngopi",
  "bensin",
  "parkir",
  "tol",
  "pulsa",
  "paket data",
  "listrik",
  "token",
  "wifi",
  "kost",

  // Metode pembayaran
  "GoPay",
  "OVO",
  "Dana",
  "ShopeePay",
  "LinkAja",
  "QRIS",
  "Tunai",
  "Cash",
  "Transfer BCA",
  "Transfer Mandiri",
  "Transfer BRI",
  "Transfer BNI",
  "Kartu Kredit",
  "Kartu Debit",

  // Kata kunci transaksi
  "transaksi",
  "pembayaran",
  "pembelian",
  "pengeluaran",
  "pemasukan",
  "gaji",
  "bonus",
  "THR",
  "freelance",
  "proyek",
  "patungan",
  "utang",
  "pinjaman",
  "cicilan",
  "tagihan",
  "iuran",
  "sewa",

  // Merchant umum Indonesia
  "Indomaret",
  "Alfamart",
  "Gojek",
  "Grab",
  "Shopee",
  "Tokopedia",
  "Bukalapak",
  "Lazada",
  "Blibli",
  "Traveloka",
  "Tiket.com",

  // Struk & invoice terms
  "total",
  "subtotal",
  "diskon",
  "promo",
  "cashback",
  "admin",
  "pajak",
  "PPN",
  "biaya layanan",
  "ongkir",
  "ongkos kirim",
].join(", ");

export class GroqWhisperProvider implements ITranscriptionProvider {
  private readonly client: Groq;

  constructor() {
    const apiKey = getConfig("GROQ_API_KEY");
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not defined");
    }
    this.client = new Groq({ apiKey });
  }

  async transcribeVoice(
    audioBuffer: Buffer,
    mimetype: string,
  ): Promise<TranscriptionResult> {
    logger.info(
      { bufferSize: audioBuffer.length, mimetype },
      "Transcribing via Groq Whisper",
    );

    // Groq's Whisper API accepts a `prompt` field that acts as a vocabulary
    // prior -financial terms and Indonesian slang listed in the prompt are
    // significantly more likely to be transcribed correctly.
    const transcription = await this.client.audio.transcriptions.create({
      file: new File([audioBuffer], "audio.ogg", { type: mimetype }),
      model: getConfig("AI_VOICE_MODEL"),
      language: "id",
      prompt: FINANCIAL_TRANSCRIPTION_PROMPT,
      response_format: "verbose_json",
      // Temperature 0 untuk transkripsi keuangan = lebih deterministik
      temperature: 0,
    });

    const durationSeconds =
      typeof (transcription as any).duration === "number"
        ? (transcription as any).duration
        : undefined;

    const detectedLanguage = (transcription as any).language ?? "id";

    logger.info(
      {
        textLength: transcription.text.length,
        language: detectedLanguage,
        durationSeconds,
      },
      "Transcription complete",
    );

    return {
      transcript: transcription.text,
      language: detectedLanguage,
      durationSeconds,
      provider: `groq-${getConfig("AI_VOICE_MODEL")}`,
    };
  }
}
