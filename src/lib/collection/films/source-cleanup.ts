import type { OriginalClipSelection } from "./types";
import {
  assertTimedSourceWords,
  captionsForWords,
  type SourceWord,
} from "./word-matching";

export const SOURCE_CLEANUP_VERSION = "conservative-source-cleanup-v2";
export type SourceSilence = { inMs: number; outMs: number };
export type SourceRemoval = SourceSilence & {
  mediaId: string;
  reason: "filler" | "silence";
  text?: string;
};
const FPS = 30;
const MIN_WORD_HANDLE_MS = 90;
const MIN_SILENCE_MS = 1500;
const KEEP_SILENCE_MS = 700;
const frameBefore = (ms: number) =>
  (Math.floor((ms * FPS) / 1000) * 1000) / FPS;
const frameAfter = (ms: number) => (Math.ceil((ms * FPS) / 1000) * 1000) / FPS;
const token = (text: string) =>
  text.toLocaleLowerCase().replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, "");
// Deliberately excludes meaningful responses (hmm/uh-huh), discourse words,
// repeated words and every phrase whose removal needs an editorial judgment.
const filler = (word: SourceWord) => {
  // UM can be a university and German/Portuguese "um" is a meaningful word.
  // Unknown language and uppercase acronyms remain untouched.
  const bare = word.text.replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, "");
  return (
    /^(?:en|eng)(?:-|$)/i.test(word.languageCode || "") &&
    !/^[A-Z]{2,}$/.test(bare) &&
    /^(?:u+m+|u+h+|e+r+m+)$/u.test(token(word.text))
  );
};

function quotedWords(words: SourceWord[]) {
  let doubleQuote = false,
    singleQuote = false;
  return words.map((word) => {
    const wasQuoted = doubleQuote || singleQuote;
    // Apostrophes within a word are not quotation marks.
    const marks =
      word.text.replace(/\p{L}['’]\p{L}/gu, "").match(/["“”‘’']/g) ?? [];
    for (const mark of marks) {
      if (mark === "“") doubleQuote = true;
      else if (mark === "”") doubleQuote = false;
      else if (mark === '"') doubleQuote = !doubleQuote;
      else if (mark === "‘") singleQuote = true;
      else if (mark === "’") singleQuote = false;
      else singleQuote = !singleQuote;
    }
    return wasQuoted || doubleQuote || singleQuote || marks.length > 0;
  });
}

/** A source-time edit only. The recording and its full transcript stay intact. */
export function cleanSourcePassage(
  clip: OriginalClipSelection,
  words: SourceWord[],
  confirmedSilence: SourceSilence[] = [],
): {
  clips: OriginalClipSelection[];
  removed: SourceRemoval[];
  skippedReason?: "clip_limit";
} {
  // Source search can retain a provider's untimed lexical token, but cleanup
  // must never turn a selected one into a playable range or silently erase it.
  if (words.some((word) => word.endMs === word.startMs))
    assertTimedSourceWords(words);
  const unchanged = () => ({ clips: [clip], removed: [] as SourceRemoval[] });
  if (
    !Number.isFinite(clip.inMs) ||
    !Number.isFinite(clip.outMs) ||
    clip.inMs < 0 ||
    clip.outMs <= clip.inMs ||
    !words.length ||
    words.some(
      (word, index) =>
        word.mediaId !== clip.mediaId ||
        !word.text.trim() ||
        !Number.isFinite(word.startMs) ||
        !Number.isFinite(word.endMs) ||
        word.startMs < clip.inMs ||
        word.endMs > clip.outMs ||
        word.endMs <= word.startMs ||
        (index > 0 && word.startMs < words[index - 1].endMs),
    )
  )
    return unchanged();
  const speakers = new Set(words.map((word) => word.speakerId).filter(Boolean));
  if (speakers.size > 1) return unchanged();
  const quoted = quotedWords(words);
  const removals: SourceRemoval[] = [];
  const removedWordIndices = new Set<number>();
  const meaningfulCount = words.filter((word) => !filler(word)).length;
  for (const [index, word] of words.entries()) {
    if (
      !filler(word) ||
      quoted[index] ||
      meaningfulCount < 4 ||
      word.endMs - word.startMs > 1200
    )
      continue;
    // Retain quoted/reported examples even when ASR omitted quotation marks.
    const context = words
      .slice(Math.max(0, index - 4), index + 5)
      .map((item) => token(item.text));
    if (
      context.some((text) =>
        /^(?:say|says|said|saying|word|words|sound|sounds|called|wrote|quote|quoted|spelled)$/.test(
          text,
        ),
      )
    )
      continue;
    const previous = words[index - 1],
      next = words[index + 1];
    // Never erase a whole response or an unresolved trailing hesitation.
    if (!next || (previous && filler(previous)) || filler(next)) continue;
    const inMs = frameBefore(word.startMs - 25);
    const outMs = frameAfter(word.endMs + 25);
    if (
      inMs <= clip.inMs ||
      outMs >= clip.outMs ||
      (previous && inMs - previous.endMs < MIN_WORD_HANDLE_MS) ||
      next.startMs - outMs < MIN_WORD_HANDLE_MS
    )
      continue;
    removals.push({
      mediaId: clip.mediaId,
      inMs,
      outMs,
      reason: "filler",
      text: word.text,
    });
    removedWordIndices.add(index);
  }

  // Transcription gaps alone are not silence. Only the quiet waveform intervals
  // supplied by the detector can authorize a pause cut; breaths/noise split them.
  for (const silence of confirmedSilence) {
    if (
      !Number.isFinite(silence.inMs) ||
      !Number.isFinite(silence.outMs) ||
      silence.inMs < 0 ||
      silence.outMs <= silence.inMs
    )
      continue;
    const start = Math.max(clip.inMs, silence.inMs);
    const end = Math.min(clip.outMs, silence.outMs);
    if (end - start <= MIN_SILENCE_MS) continue;
    if (words.some((word) => word.startMs < end && word.endMs > start))
      continue;
    const beforeIndex = words.findLastIndex((word) => word.endMs <= start);
    const afterIndex = words.findIndex((word) => word.startMs >= end);
    if (
      removedWordIndices.has(beforeIndex) ||
      removedWordIndices.has(afterIndex)
    )
      continue;
    const inMs = frameAfter(start + KEEP_SILENCE_MS / 2);
    const outMs = frameBefore(end - KEEP_SILENCE_MS / 2);
    if (outMs - inMs < 100 || inMs <= clip.inMs || outMs >= clip.outMs)
      continue;
    removals.push({ mediaId: clip.mediaId, inMs, outMs, reason: "silence" });
  }
  removals.sort((a, b) => a.inMs - b.inMs);
  if (removals.length >= 500)
    return { clips: [clip], removed: [], skippedReason: "clip_limit" };
  // Conflicting evidence keeps the passage intact, rather than guessing which
  // removal to apply. This also rejects duplicate/overlapping detector ranges.
  if (
    !removals.length ||
    removals.some(
      (range, index) => index > 0 && range.inMs < removals[index - 1].outMs,
    )
  )
    return unchanged();
  const ranges: SourceSilence[] = [];
  let cursor = clip.inMs;
  for (const removal of removals) {
    ranges.push({ inMs: cursor, outMs: removal.inMs });
    cursor = removal.outMs;
  }
  ranges.push({ inMs: cursor, outMs: clip.outMs });
  if (ranges.some((range) => range.outMs - range.inMs < 100))
    return unchanged();
  const retainedWords = words.filter(
    (_, index) => !removedWordIndices.has(index),
  );
  const clips = ranges.map((range) => {
    const selected = retainedWords.filter(
      (word) => word.startMs >= range.inMs && word.endMs <= range.outMs,
    );
    const first = selected[0],
      last = selected.at(-1);
    return {
      mediaId: clip.mediaId,
      ...range,
      captions: captionsForWords(selected),
      // Fades are permitted only inside known word handles. The renderer owns
      // sample-level shaping and never overlaps adjacent spoken syllables.
      audioFadeInMs: Math.min(
        15,
        Math.max(0, (first?.startMs ?? range.outMs) - range.inMs),
      ),
      audioFadeOutMs: Math.min(
        15,
        Math.max(0, range.outMs - (last?.endMs ?? range.inMs)),
      ),
    };
  });
  return { clips, removed: removals };
}
