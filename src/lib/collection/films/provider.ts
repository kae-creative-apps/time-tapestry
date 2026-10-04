import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { FilmVoice } from "./types";
import { reserveProviderBudget } from "../../security/request";
import {
  interviewerVoiceConfigured,
  resolveInterviewerVoice,
} from "../../elevenlabs-client";

export function filmsAvailable() {
  return interviewerVoiceConfigured();
}

/** Only the configured interviewer's voice is used. No storyteller voice cloning. */
export async function resolveFilmVoice(): Promise<FilmVoice> {
  return resolveInterviewerVoice();
}

export async function narrateFilmChunk(
  voice: FilmVoice,
  text: string,
  previousText?: string,
  nextText?: string,
) {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error(
      "ElevenLabs narration is not configured on the film worker.",
    );
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
    timeoutInSeconds: 180,
    maxRetries: 0,
  });
  // Called only for an uncached, validated chunk; ready audio is reused upstream.
  await reserveProviderBudget("render_film");
  try {
    const result = await client.textToSpeech.convertWithTimestamps(
      voice.voiceId,
      {
        text,
        modelId: voice.modelId,
        voiceSettings: voice.settings,
        outputFormat: "mp3_44100_128",
        previousText,
        nextText,
      },
    );
    const alignment = result.alignment;
    if (!result.audioBase64 || !alignment)
      throw new Error("Narration returned no audio or timing.");
    return { bytes: Buffer.from(result.audioBase64, "base64"), alignment };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    throw new Error(
      status
        ? `The narration service returned HTTP ${status}. Your completed work is preserved; review the issue before retrying.`
        : "Narration did not finish. Completed audio is preserved. An explicit retry may repeat the unfinished part.",
    );
  }
}
