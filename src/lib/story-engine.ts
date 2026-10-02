import { demoStory } from '@/lib/mock-data';

export function generateStoryFromTranscript(transcript: string): {
  welcomeNote: string;
  chapters: Array<{ title: string; content: string; audioUrl?: string }>;
  causes: string[];
  values: string[];
  keyQuotes: string[];
} {
  const text = transcript.trim();
  if (!text) {
    return {
      welcomeNote: demoStory.welcomeNote,
      chapters: demoStory.chapters,
      causes: demoStory.causes,
      values: demoStory.values,
      keyQuotes: demoStory.keyQuotes
    };
  }

  const sentences = text
    .replace(/([.?!])\s+/g, '$1|')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const quotes = sentences.slice(0, 3);
  const chapterBody = sentences.join(' ');

  return {
    welcomeNote:
      'Here is the story you shared. It belongs to your family now.',
    chapters: [
      {
        title: 'Your Story',
        content: chapterBody || text
      },
      {
        title: 'What Mattered Most',
        content:
          'Generosity, faith, family, and paying attention to the people around you came through in what you shared. These are the threads that hold a life together.'
      },
      {
        title: 'What I Hope You Remember',
        content:
          'A good life does not have to be loud. It can be a letter, a meal, a coat on a porch. When you give someday, give in your own name, in your own way. Just do not forget to notice.'
      }
    ],
    causes: [
      'The people and places you noticed along the way',
      'The values you were handed and the ones you chose to keep'
    ],
    values: [
      'Generosity',
      'Faith',
      'Family',
      'Hospitality',
      'Noticing the people around you'
    ],
    keyQuotes: quotes.length ? quotes : ['Thank you for sharing your story.']
  };
}
