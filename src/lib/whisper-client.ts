import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

export const openaiSTT = apiKey ? new OpenAI({ apiKey }) : null;

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!openaiSTT) {
    return mockTranscribe();
  }

  const response = await openaiSTT.audio.transcriptions.create({
    file: audioBlob as any,
    model: 'whisper-1'
  });

  return response.text;
}

export function mockTranscribe(): Promise<string> {
  // deliberate: mock STT returns a generic warm response so flows work offline
  return Promise.resolve(
    "I remember when I was young, my grandmother always made sure we shared what we had with others. She'd say generosity isn't about what you give, it's about seeing the people around you."
  );
}
