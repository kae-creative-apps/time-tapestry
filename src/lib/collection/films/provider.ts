import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { FilmVoice } from "./types";

export function filmsAvailable() {
  return Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() &&
    process.env.ELEVENLABS_AGENT_ID?.trim(),
  );
}

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
    ? value
    : fallback;

/** Only the configured interviewer's voice is used. No storyteller voice cloning. */
export async function resolveFilmVoice(): Promise<FilmVoice> {
  if (!filmsAvailable())
    throw new Error(
      "Film narration needs the configured ElevenLabs interviewer. Your written stories and originals are saved.",
    );
  const modelId =
    process.env.STORY_FILM_TTS_MODEL?.trim() || "eleven_multilingual_v2";
  if (
    ![
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_flash_v2_5",
    ].includes(modelId)
  )
    throw new Error(
      "Choose a supported REST narration model for STORY_FILM_TTS_MODEL.",
    );
  const agentId = process.env.ELEVENLABS_AGENT_ID!.trim();
  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY!.trim(),
    timeoutInSeconds: 20,
    maxRetries: 0,
  });
  let agent;
  try {
    agent = await client.conversationalAi.agents.get(agentId);
  } catch {
    throw new Error(
      "The interviewer voice could not be verified. Please try again before generating films.",
    );
  }
  const tts = agent.conversationConfig.tts;
  if (!tts?.voiceId)
    throw new Error("The configured interviewer has no narration voice.");
  return {
    agentId,
    voiceId: tts.voiceId,
    modelId,
    settings: {
      stability: finite(tts.stability, 0.5, 0, 1),
      similarityBoost: finite(tts.similarityBoost, 0.8, 0, 1),
      speed: finite(tts.speed, 1, 0.7, 1.2),
      style: 0,
      useSpeakerBoost: true,
    },
  };
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
