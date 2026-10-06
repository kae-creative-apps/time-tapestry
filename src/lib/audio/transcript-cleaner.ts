import {
  cleanSourcePassage,
  type SourceSilence,
} from "../collection/films/source-cleanup";
import type { SourceWord } from "../collection/films/word-matching";
/** Suspected repetition is flagged, not silently removed: emphasis can be meaningful. */
export function cleanTranscript(input: {
  mediaId: string;
  durationMs: number;
  words: SourceWord[];
  confirmedSilence?: SourceSilence[];
}) {
  const { mediaId, durationMs, words } = input;
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error("A measured recording duration is required.");
  const invalid = words.some(
    (word, index) =>
      word.mediaId !== mediaId ||
      !word.text.trim() ||
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < 0 ||
      word.endMs <= word.startMs ||
      word.endMs > durationMs ||
      (index > 0 && word.startMs < words[index - 1].endMs),
  );
  const clip = { mediaId, inMs: 0, outMs: durationMs };
  if (invalid || !words.length)
    return { clips: [clip], removed: [], flags: [], fallback: true };
  const token = (value: string) =>
    value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const flags = words.flatMap((word, index) =>
    index > 0 &&
    token(word.text) &&
    token(word.text) === token(words[index - 1].text) &&
    word.startMs - words[index - 1].endMs < 400
      ? [
          {
            reason: "possible_stutter" as const,
            startMs: words[index - 1].startMs,
            endMs: word.endMs,
          },
        ]
      : [],
  );
  return {
    ...cleanSourcePassage(clip, words, input.confirmedSilence ?? [], {
      minimumSilenceMs: 1200,
      keepSilenceMs: 300,
    }),
    flags,
    fallback: false,
  };
}
