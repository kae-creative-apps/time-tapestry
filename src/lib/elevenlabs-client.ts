import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const apiKey = process.env.ELEVENLABS_API_KEY;

export const elevenlabs = apiKey ? new ElevenLabsClient({ apiKey }) : null;

export async function streamTextToSpeech(
  text: string,
  voiceId: string = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
): Promise<ReadableStream<Uint8Array> | null> {
  if (!elevenlabs) return null;
  const response = await elevenlabs.textToSpeech.stream(voiceId, {
    text,
    modelId: 'eleven_flash_v2_5',
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.75,
      speed: 0.85
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
