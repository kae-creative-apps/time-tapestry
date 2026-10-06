import { createHash } from "node:crypto";
import { CHAPTERS } from "../../interview-state";
import type { Collection } from "../types";
import { selectedAnswers } from "../content";
import type {
  FilmChapter,
  FilmVoice,
  FilmWord,
  NarratedFilmPlan,
} from "./types";

export const FILM_TEMPLATE_VERSION = "narrated-story-orb-v2";
export const FILM_FPS = 30;
export const FILM_INTRO_SECONDS = 3;
export const FILM_CLOSER_SECONDS = 4;
export const MAX_SCRIPT_CHARACTERS = 32000;
export const MAX_FILM_SECONDS = 3600;
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

/** Read the complete reviewed text. No invented linking facts or shortened themes. */
export function narrationScript(name: string, title: string, content: string) {
  const script = `${title}. A story from ${name}, read by an AI voice. These are ${name}'s reviewed words.\n\n${content.trim()}`;
  if (!content.trim() || script.length > MAX_SCRIPT_CHARACTERS)
    throw new Error(
      `Each complete film script must contain 1 to ${MAX_SCRIPT_CHARACTERS} characters. Shorten the reviewed story explicitly before trying again; nothing has been truncated.`,
    );
  return script;
}

export function filmChapters(c: Collection): FilmChapter[] {
  if (c.chapters.length !== 4 || c.draftOutdated)
    throw new Error(
      "Create and review all four current story drafts before making films.",
    );
  return CHAPTERS.map((theme, i) => {
    const chapter = c.chapters.find((entry) => entry.id === theme.id);
    if (!chapter?.content.trim())
      throw new Error("All four themes need a written story.");
    const answers = selectedAnswers(c, chapter.id);
    const ids = answers.map((answer) => answer.id);
    if (
      !ids.length ||
      ids.length !== chapter.sourceTakeIds.length ||
      ids.some((id) => !chapter.sourceTakeIds.includes(id))
    )
      throw new Error(
        "Your source answers changed. Recreate and review the written drafts before making films.",
      );
    const script = narrationScript(
      c.storyteller.name,
      chapter.title,
      chapter.content,
    );
    return {
      chapterId: chapter.id,
      chapterNumber: (i + 1) as 1 | 2 | 3 | 4,
      title: chapter.title,
      content: chapter.content,
      script,
      sourceTakeIds: [...chapter.sourceTakeIds],
      sourceSha256: sha256(
        JSON.stringify({
          title: chapter.title,
          content: chapter.content,
          sources: answers.map(({ id, text, prompt }) => ({
            id,
            text,
            prompt,
          })),
        }),
      ),
      scriptSha256: sha256(script),
      status: "queued",
      progress: 0,
    };
  });
}

export function collectionFilmSourceHash(c: Collection) {
  return sha256(
    JSON.stringify({
      collectionId: c.id,
      storytellerName: c.storyteller.name,
      chapters: filmChapters(c).map(
        ({ chapterId, sourceSha256, scriptSha256 }) => ({
          chapterId,
          sourceSha256,
          scriptSha256,
        }),
      ),
    }),
  );
}

export function filmVersionHash(sourceSha256: string, voice: FilmVoice) {
  return sha256(
    JSON.stringify({
      sourceSha256,
      voice,
      templateVersion: FILM_TEMPLATE_VERSION,
    }),
  );
}

/** Split without losing any original character, including punctuation and spaces. */
export function splitNarration(script: string, limit = 2400): string[] {
  if (!Number.isInteger(limit) || limit < 100)
    throw new Error("Invalid narration chunk size.");
  const chunks: string[] = [];
  let rest = script;
  while (rest.length > limit) {
    const candidate = rest.slice(0, limit);
    const sentence = [...candidate.matchAll(/[.!?]\s+/g)].at(-1);
    let cut = sentence
      ? sentence.index! + sentence[0].length
      : candidate.lastIndexOf(" ") + 1;
    if (cut < limit / 3) cut = limit;
    // Never split a surrogate pair.
    if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) cut -= 1;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function alignedWords(
  alignment: {
    characters: string[];
    characterStartTimesSeconds: number[];
    characterEndTimesSeconds: number[];
  },
  offsetMs = 0,
): FilmWord[] {
  const {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
  } = alignment;
  if (
    !characters.length ||
    characters.length !== starts.length ||
    characters.length !== ends.length
  )
    throw new Error("Narration did not include complete word timing.");
  const words: FilmWord[] = [];
  let word: FilmWord | null = null;
  characters.forEach((character, i) => {
    if (
      !Number.isFinite(starts[i]) ||
      !Number.isFinite(ends[i]) ||
      starts[i] < 0 ||
      ends[i] < starts[i]
    )
      throw new Error("Narration returned invalid timing.");
    if (/^\s+$/.test(character)) {
      if (word) words.push(word);
      word = null;
    } else {
      if (!word)
        word = {
          text: "",
          startMs: offsetMs + Math.round(starts[i] * 1000),
          endMs: 0,
        };
      word.text += character;
      word.endMs = offsetMs + Math.round(ends[i] * 1000);
    }
  });
  if (word) words.push(word);
  return words;
}

export function validateNarratedFilmPlan(plan: NarratedFilmPlan) {
  if (
    plan.schemaVersion !== 1 ||
    plan.narrationKind !== "ai_interviewer" ||
    !/^q[1-4]$/.test(plan.chapterId) ||
    plan.chapterNumber !== Number(plan.chapterId.slice(1))
  )
    throw new Error("Invalid narrated film identity.");
  if (
    !plan.title.trim() ||
    plan.title.length > 120 ||
    !plan.storytellerName.trim() ||
    !plan.script.trim() ||
    plan.script.length > MAX_SCRIPT_CHARACTERS ||
    !plan.sourceTakeIds.length
  )
    throw new Error(
      "Narrated film needs its complete source attribution and script.",
    );
  if (
    [plan.sourceSha256, plan.scriptSha256, plan.audioSha256].some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    ) ||
    sha256(plan.script) !== plan.scriptSha256
  )
    throw new Error("Narrated film provenance is invalid.");
  const total =
    plan.audioDurationMs / 1000 + FILM_INTRO_SECONDS + FILM_CLOSER_SECONDS;
  if (!Number.isFinite(total) || total <= 7 || total > MAX_FILM_SECONDS)
    throw new Error(
      "The complete film exceeds one hour or has invalid audio. No story was shortened.",
    );
  if (
    plan.words
      .map((word) => word.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() !== plan.script.replace(/\s+/g, " ").trim()
  )
    throw new Error(
      "Narration captions do not cover the complete reviewed script.",
    );
  let lastStart = 0;
  if (!plan.words.length) throw new Error("Narration timing is missing.");
  for (const word of plan.words) {
    if (
      !word.text ||
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < lastStart ||
      word.endMs < word.startMs ||
      word.endMs > plan.audioDurationMs + 150
    )
      throw new Error("Narration word timing is invalid.");
    lastStart = word.startMs;
  }
  return plan;
}
