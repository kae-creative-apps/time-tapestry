import { CHAPTERS } from "./interview-state";

/** One visual system, with a named variant for each established interview theme. */
export const STORY_FILM_WIDTH = 1920;
export const STORY_FILM_HEIGHT = 1080;
export const STORY_FILM_FPS = 30;
export const STORY_FILM_INTRO_SECONDS = 3;
export const STORY_FILM_CLOSER_SECONDS = 4;

export type StoryFilmTemplate = {
  chapterNumber: number;
  chapterId: string;
  theme: string;
  /** Offsets change the weave composition without changing approved artwork. */
  patternOffset: readonly [number, number];
  patternOpacity: number;
};

const positions = [
  [-160, -100],
  [-350, -220],
  [-80, -280],
  [-260, -50],
] as const;

export const STORY_FILM_TEMPLATES: readonly StoryFilmTemplate[] = CHAPTERS.map(
  (chapter, index) => ({
    chapterNumber: index + 1,
    chapterId: chapter.id,
    theme: chapter.title,
    patternOffset: positions[index],
    patternOpacity: 0.045,
  }),
);

export function storyFilmTemplate(chapterNumber: number): StoryFilmTemplate {
  const template = STORY_FILM_TEMPLATES[chapterNumber - 1];
  if (!template) {
    throw new Error("A story film must use one of the four interview themes.");
  }
  return template;
}
