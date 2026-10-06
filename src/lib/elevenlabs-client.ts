import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { stripConversationPerformanceCues } from "./collection/conversation-copy";

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

export const elevenlabs = apiKey
  ? new ElevenLabsClient({ apiKey, timeoutInSeconds: 20, maxRetries: 0 })
  : null;

export type InterviewerVoice = {
  agentId: string;
  voiceId: string;
  modelId: string;
  settings: {
    stability: number;
    similarityBoost: number;
    speed: number;
    style: number;
    useSpeakerBoost: boolean;
  };
};

export function interviewerVoiceConfigured() {
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

/** Resolve the same interviewer's identity and settings for every generated voiceover. */
export async function resolveInterviewerVoice(): Promise<InterviewerVoice> {
  if (!elevenlabs || !interviewerVoiceConfigured())
    throw new Error(
      "The voice is not configured. Your written questions and original recordings are still available.",
    );
  // Realtime agent models may require a different transport. Keep one explicit,
  // supported REST model for both read-aloud and film narration, never another voice.
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
  let agent;
  try {
    agent = await elevenlabs.conversationalAi.agents.get(agentId);
  } catch {
    throw new Error(
      "The voice could not be verified. Please try again.",
    );
  }
  const tts = agent.conversationConfig.tts;
  if (!tts?.voiceId?.trim())
    throw new Error("The conversation has no narration voice configured.");
  return {
    agentId,
    voiceId: tts.voiceId,
    modelId,
    settings: {
      stability: finite(tts.stability, 0.5, 0, 1),
      similarityBoost: finite(tts.similarityBoost, 0.75, 0, 1),
      speed: finite(tts.speed, 1, 0.7, 1.2),
      style: 0,
      useSpeakerBoost: true,
    },
  };
}

export async function streamTextToSpeech(
  text: string,
  beforeGenerate: () => Promise<void>,
): Promise<ReadableStream<Uint8Array>> {
  const spokenText = stripConversationPerformanceCues(text);
  if (!spokenText.trim())
    throw new Error("There is no question to read.");
  const voice = await resolveInterviewerVoice();
  // Verify the current voice before consuming the shared paid-provider allowance.
  await beforeGenerate();
  const response = await elevenlabs!.textToSpeech.stream(voice.voiceId, {
    text: spokenText,
    modelId: voice.modelId,
    voiceSettings: voice.settings,
  });
  return response as unknown as ReadableStream<Uint8Array>;
}
