import type { AiExtractionOutput } from "@fincore/contracts";

export interface ExtractionContext {
  categories: {
    expense: string[];
    income: string[];
    transfer: string[];
  };
  paymentMethods: string[];
  tags: string[];
}

// ─── AI Provider Interface ────────────────────────────────────────────────────
export interface IAiProvider {
  extractTransaction(
    content: string,
    context?: ExtractionContext,
  ): Promise<{
    raw: string;
    parsed: AiExtractionOutput[];
    usage?: { inputTokens: number; outputTokens: number };
  }>;
  generateSummary(data: unknown): Promise<string>;
}

// ─── Transcription Provider Interface ────────────────────────────────────────
export interface ITranscriptionProvider {
  transcribeVoice(
    audioBuffer: Buffer,
    mimetype: string,
  ): Promise<TranscriptionResult>;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
  durationSeconds?: number;
  provider: string;
}

// ─── Vision Provider Interface ────────────────────────────────────────────────
export interface IVisionProvider {
  analyzeReceipt(imageBuffer: Buffer, mimetype: string): Promise<OcrResult>;
}

export interface OcrResult {
  extractedText: string;
  provider: string;
  confidence?: number;
}
