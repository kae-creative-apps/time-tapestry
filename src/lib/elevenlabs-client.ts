import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const apiKey = process.env.ELEVENLABS_API_KEY;

export const elevenlabs = apiKey ? new ElevenLabsClient({ apiKey }) : null;

// Audition the configured voice with real interview prompts before release.
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

export async function streamTextToSpeech(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
): Promise<ReadableStream<Uint8Array> | null> {
  if (!elevenlabs) return null;
  const response = await elevenlabs.textToSpeech.stream(voiceId, {
    text,
    modelId: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0,
      useSpeakerBoost: true,
      speed: 0.98,
    },
  });
  return response as unknown as ReadableStream<Uint8Array>;
}

export function speakWithBrowserTTS(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 1.02;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
