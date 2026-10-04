import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createReadStream } from "node:fs";
import type { SourceWord } from "./word-matching";
import { validateSourceWords } from "./word-matching";
import { reserveProviderBudget } from "../../security/request";

export class TransientFilmError extends Error {
  readonly retryable = true;
}
export const automaticFilmsAvailable = () =>
  Boolean(process.env.ELEVENLABS_API_KEY?.trim());
export async function transcribeOriginal(
  file: string,
  mediaId: string,
  durationMs: number,
): Promise<SourceWord[]> {
  if (!automaticFilmsAvailable())
    throw new Error(
      "Automatic original-film preparation needs ElevenLabs transcription on the worker. Your original recordings remain saved.",
    );
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
    timeoutInSeconds: 240,
    maxRetries: 0,
  });
  // Cache and source validation happen before this provider adapter is called.
  await reserveProviderBudget("render_film");
  try {
    const result = await client.speechToText.convert({
      file: createReadStream(file),
      modelId: "scribe_v2",
      timestampsGranularity: "word",
      diarize: true,
      tagAudioEvents: false,
      temperature: 0,
    });
    if (!("words" in result))
      throw new Error("Missing source word timestamps.");
    const words = result.words
      .filter((word) => word.type === "word")
      .map((word) => ({
        mediaId,
        text: word.text,
        startMs: Math.round((word.start ?? NaN) * 1000),
        endMs: Math.round((word.end ?? NaN) * 1000),
        speakerId: word.speakerId,
      }));
    return validateSourceWords(words, durationMs, mediaId);
  } catch (error) {
    if (
      error instanceof Error &&
      /timestamps|transcription returned|source words/.test(error.message)
    )
      throw error;
    const status = (error as { statusCode?: number })?.statusCode;
    const ErrorType =
      !status || status === 408 || status === 429 || status >= 500
        ? TransientFilmError
        : Error;
    throw new ErrorType(
      status
        ? `Original transcription returned HTTP ${status}. Saved recordings and completed work are preserved.`
        : "Original transcription did not finish. Completed work is preserved; a bounded automatic retry may repeat the unfinished transcription request.",
    );
  }
}
