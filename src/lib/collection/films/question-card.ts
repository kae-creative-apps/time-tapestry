import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selectedAnswers } from "../content";
import { getChapterQuestion, type ChapterId } from "../../interview-state";
import type { Collection } from "../types";
import { QUESTION_CARD_SECONDS } from "../../video-plan";

export { QUESTION_CARD_SECONDS };

const FALLBACK_PROMPT = "Your conversation";

/** Short category on the card. Full chapter titles stay on the story itself. */
export const QUESTION_CARD_LABELS = {
  q1: "Kindness",
  q2: "Faith",
  q3: "Generosity",
  q4: "Encouragement",
} as const satisfies Record<ChapterId, string>;

export function questionCardLabel(chapterId: ChapterId) {
  return QUESTION_CARD_LABELS[chapterId];
}

/**
 * The question the interviewer actually asked before the first saved answer
 * in this chapter. The written chapter question is only a fallback.
 */
export function chapterOpeningQuestion(
  c: Collection,
  chapterId: ChapterId,
): string {
  const saved = selectedAnswers(c, chapterId)
    .map((answer) => answer.prompt.replace(/\s+/g, " ").trim())
    .find((prompt) => prompt && prompt !== FALLBACK_PROMPT);
  const question =
    saved ||
    getChapterQuestion(chapterId, {
      recipientName: c.recipient.name,
      faithFraming: c.faithFraming,
    });
  return question.replace(/\s+/g, " ").trim();
}

/** One file, or STORY_FILM_QUESTION_MUSIC, so a licensed track can replace it. */
export function questionCardMusicPath() {
  const override = process.env.STORY_FILM_QUESTION_MUSIC?.trim();
  if (override) return override;
  return path.resolve("public/brand/audio/question-card-bed.wav");
}

export function questionCardFontPath() {
  return path.resolve("public/brand/fonts/inter-latin-400.woff2");
}

export async function questionCardMusicSha256() {
  const file = await readFile(questionCardMusicPath());
  return createHash("sha256").update(file).digest("hex");
}
