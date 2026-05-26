import type { AiExtractionOutput } from "@fincore/contracts";

// ─── AI Provider Interface ────────────────────────────────────────────────────
export interface IAiProvider {
  extractTransaction(content: string): Promise<AiExtractionOutput>;
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
