import { demoStory } from '@/lib/mock-data';

export function generateStoryFromTranscript(transcript: string): {
  welcomeNote: string;
  chapters: Array<{ title: string; content: string; audioUrl?: string }>;
  causes: string[];
  values: string[];
  keyQuotes: string[];
} {
  // deliberate: mock engine returns the demo story so the hackathon flow works without AI keys
  void transcript;
  return {
    welcomeNote: demoStory.welcomeNote,
    chapters: demoStory.chapters,
    causes: demoStory.causes,
    values: demoStory.values,
    keyQuotes: demoStory.keyQuotes
  };
}
