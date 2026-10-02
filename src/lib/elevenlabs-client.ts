import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const apiKey = process.env.ELEVENLABS_API_KEY;

export const elevenlabs = apiKey ? new ElevenLabsClient({ apiKey }) : null;

const DEFAULT_VOICE_ID = 'Xb7hH8MSUJpSbSDYk0k2';

export async function streamTextToSpeech(
  text: string,
  voiceId: string = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
): Promise<ReadableStream<Uint8Array> | null> {
  if (!elevenlabs) return null;
  const response = await elevenlabs.textToSpeech.stream(voiceId, {
    text,
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
    voiceSettings: {
      stability: 0.45,
      similarityBoost: 0.8,
      speed: 0.9
    }
  });
  return response as unknown as ReadableStream<Uint8Array>;
}

export function speakWithBrowserTTS(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
