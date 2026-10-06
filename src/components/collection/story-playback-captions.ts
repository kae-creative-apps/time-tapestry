import type { PlaybackWord } from "@/lib/audio/playback-types";

export type PlaybackPhrase = {
  words: PlaybackWord[];
  startMs: number;
  endMs: number;
};

/** Short phrases follow source timing; pauses never invent words or advance time. */
export function playbackPhrases(
  words: readonly PlaybackWord[],
): PlaybackPhrase[] {
  const phrases: PlaybackPhrase[] = [];
  let current: PlaybackWord[] = [];
  const finish = () => {
    if (current.length)
      phrases.push({
        words: current,
        startMs: current[0].startMs,
        endMs: current[current.length - 1].endMs,
      });
    current = [];
  };
  for (const word of words) {
    if (
      !word.text.trim() ||
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < 0 ||
      word.endMs < word.startMs
    )
      continue;
    if (
      current.length &&
      word.startMs - current[current.length - 1].endMs > 700
    )
      finish();
    current.push(word);
    if (
      current.length >= 8 ||
      (current.length >= 3 && /[.!?][”’"']?$/.test(word.text))
    )
      finish();
  }
  finish();
  return phrases;
}

export function phraseAtTime(
  phrases: readonly PlaybackPhrase[],
  timeMs: number,
): PlaybackPhrase | undefined {
  if (!phrases.length) return undefined;
  let lo = 0,
    hi = phrases.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (phrases[mid].startMs <= timeMs) lo = mid;
    else hi = mid - 1;
  }
  return phrases[lo];
}

export function playbackClock(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
