import getConfig from "@fincore/config";
import { createLogger } from "@fincore/logger";
import Groq from "groq-sdk";
import { ITranscriptionProvider, TranscriptionResult } from "../interfaces";

const logger = createLogger("ai:groq-whisper");

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
      { bufferSize: audioBuffer.length },
      "Transcribing via Groq Whisper",
    );

    const file = new File([audioBuffer], "audio.ogg", { type: mimetype });

    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: "id", // Indonesian
      response_format: "verbose_json",
    });

    logger.info("Transcription complete");

    return {
      transcript: transcription.text,
      language: (transcription as any).language ?? "id",
      durationSeconds: (transcription as any).duration,
      provider: "groq-whisper-large-v3",
    };
  }
}
