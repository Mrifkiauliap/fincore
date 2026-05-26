import Groq from 'groq-sdk';
import { ITranscriptionProvider, TranscriptionResult } from '../interfaces';
import { createLogger } from '@fincore/logger';

const logger = createLogger('ai:groq-whisper');

export class GroqWhisperProvider implements ITranscriptionProvider {
  private readonly client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async transcribeVoice(
    audioBuffer: Buffer,
    mimetype: string,
  ): Promise<TranscriptionResult> {
    logger.info({ bufferSize: audioBuffer.length }, 'Transcribing via Groq Whisper');

    const file = new File([audioBuffer], 'audio.ogg', { type: mimetype });

    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: 'id', // Indonesian
      response_format: 'verbose_json',
    });

    logger.info('Transcription complete');

    return {
      transcript: transcription.text,
      language: transcription.language ?? 'id',
      durationSeconds: (transcription as any).duration,
      provider: 'groq-whisper-large-v3',
    };
  }
}
