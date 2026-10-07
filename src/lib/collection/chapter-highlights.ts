import { cleanTranscriptForReading } from "./transcript-reading";
import { VIDEO_CLOSER_SECONDS, VIDEO_INTRO_SECONDS } from "../video-plan";

export type ChapterMoment = {
  quote: string;
  /** Film time in milliseconds. Absent when the recording has no word timing. */
  startMs: number | null;
};

type CaptionCue = { text: string; startMs: number; endMs: number };

type TimedFilm = {
  durationSeconds?: number;
  sourceRanges?: Array<{
    inMs: number;
    outMs: number;
    captions?: Array<{ text?: string; startMs: number; endMs: number }>;
  }>;
};

const MIN_QUOTE = 24;
const MAX_QUOTE = 160;

function readable(text: string) {
  return cleanTranscriptForReading(text)
    .text.replace(
      /(?:^|(?<=[.!?]\s))(?:[Uu]m+|[Uu]h+)\s+(?=I\b|we\b|the\b|a\b|and\b|it\b|that\b|she\b|he\b|my\b|you\b)/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

const LEADING =
  /^(?:yeah|yes|yep|no|hmm+|oh|ah|uh+|um+|so|and|but|well|okay|ok|sorry|like|probably|just)[,.]?\s+/iu;
const ACKNOWLEDGEMENT =
  /^(?:yeah|yes|yep|no|hmm+|oh|ah|okay|ok|sorry|snappy|what)[.!?]?$/iu;

function wordCount(text: string) {
  return text.split(/\s+/u).filter(Boolean).length;
}

/** A display quote made only of words that were already in the recording. */
function polishSentence(raw: string) {
  let text = readable(raw)
    .replace(/(?:^|\s)\p{L}-(?=\s|$)/gu, " ")
    .replace(/\b([\p{L}']+),?\s+\1\b/giu, "$1")
    .replace(/,\s+and,/giu, " and")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.\s]+|[,:\s]+$/gu, "");
  for (let pass = 0; pass < 5 && LEADING.test(text); pass++) {
    const next = text.replace(LEADING, "").trim();
    if (wordCount(next) < 2 || next.length < 8) break;
    text = next;
  }
  text = text
    .replace(/\s+(?:yeah|yes|yep|hmm+)\.?$/iu, "")
    .replace(/[,:]?\s+\b(?:and|but|or|so|because)\b$/iu, "")
    .trim();
  if (/^(?:what|snappy)\b/iu.test(text)) return "";
  if (text.length > MAX_QUOTE) {
    const clause = text.split(/,\s+/u)[0]?.trim() || "";
    text =
      clause.length >= MIN_QUOTE && clause.length <= MAX_QUOTE
        ? clause
        : text.split(/\s+/u).slice(0, 18).join(" ");
    text = text.replace(/[,:\s]+$/u, "").trim();
  }
  if (!text || ACKNOWLEDGEMENT.test(text)) return "";
  const words = wordCount(text);
  const ended = /[.!?]$/u.test(text);
  if (words < 2) return "";
  if (words < 3 && text.length < 8) return "";
  if (!ended && text.length < MIN_QUOTE) return "";
  if (words < 4 && text.length < 12) return "";
  if (ended && text.length < 8) return "";
  if (!ended && words >= 4) text = `${text}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function quoteScore(quote: string) {
  const words = wordCount(quote);
  let score = Math.min(words, 14);
  if (/[.!?]$/u.test(quote)) score += 2;
  if (quote.length >= 36 && quote.length <= 140) score += 3;
  if (/\b(?:big question)\b/iu.test(quote)) score -= 6;
  if (/\blike\b/iu.test(quote)) score -= 5;
  if (/^(?:\S+\s+){0,3}\S+\s+(?:was|is),/iu.test(quote)) score -= 5;
  if (/^(?:helped|wanted|got|made|told|said|went)\b/iu.test(quote)) score -= 4;
  if (/^something to\b/iu.test(quote)) score -= 4;
  return score;
}

/** Maps source-caption times onto the finished film, after the title and before the closer. */
export function filmCaptionCues(film: TimedFilm | undefined): CaptionCue[] {
  const ranges = film?.sourceRanges || [];
  if (!ranges.length) return [];
  let cursor = 0;
  const placed = ranges.flatMap((range) => {
    const span = Math.max(0, range.outMs - range.inMs);
    const filmStart = cursor;
    cursor += span;
    return (range.captions || []).flatMap((caption) => {
      if (!caption.text?.trim()) return [];
      if (
        !Number.isFinite(caption.startMs) ||
        caption.startMs < range.inMs - 80 ||
        caption.startMs > range.outMs + 80
      )
        return [];
      const startMs = filmStart + Math.max(0, caption.startMs - range.inMs);
      const endMs = filmStart + Math.max(0, caption.endMs - range.inMs);
      return [{ text: caption.text, startMs, endMs }];
    });
  });
  const durationMs = (film?.durationSeconds || 0) * 1000;
  const extra = durationMs - cursor - VIDEO_CLOSER_SECONDS * 1000;
  const introMs =
    extra >= 2000 && extra <= 14000 ? extra : VIDEO_INTRO_SECONDS * 1000;
  return placed
    .map((cue) => ({
      ...cue,
      startMs: cue.startMs + introMs,
      endMs: cue.endMs + introMs,
    }))
    .filter((cue) => cue.endMs > cue.startMs);
}

function splitSentences(text: string) {
  return text
    .replace(/(?:\.{2,}|…)/gu, ".")
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function pickSpread(
  items: Array<{ moment: ChapterMoment; score: number }>,
): ChapterMoment[] {
  const viable = items.filter((item) => item.moment.quote);
  if (viable.length <= 3) return viable.map((item) => item.moment);
  const bestScore = Math.max(...viable.map((item) => item.score));
  const strong = viable.filter((item) => item.score >= bestScore - 4);
  const pool = strong.length >= 3 ? strong : viable;
  if (pool.length <= 3) return pool.map((item) => item.moment);
  let best: typeof pool | null = null;
  let bestValue = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]];
        const times = trio.map((item) => item.moment.startMs ?? 0);
        const gaps = [times[1] - times[0], times[2] - times[1]];
        const value =
          trio.reduce((sum, item) => sum + item.score, 0) +
          (times[2] - times[0]) / 4000 -
          (gaps.some((gap) => gap >= 0 && gap < 2500) ? 8 : 0);
        if (value > bestValue) {
          bestValue = value;
          best = trio;
        }
      }
    }
  }
  return (best || pool.slice(0, 3)).map((item) => item.moment);
}

function sameQuote(left: string, right: string) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  return normalize(left) === normalize(right);
}

function clauseQuotes(sentence: string) {
  const polished = polishSentence(sentence);
  if (!polished) return [];
  const pieces =
    polished.length > 72 ? polished.split(/\s+and\s+/u) : [polished];
  if (pieces.length === 1) return [polished];
  return pieces.flatMap((piece) => {
    let text = piece.trim().replace(/^[,.\s]+|[,:\s]+$/gu, "");
    if (!text) return [];
    if (!/[.!?]$/u.test(text) && wordCount(text) >= 4) text = `${text}.`;
    text = text.charAt(0).toUpperCase() + text.slice(1);
    const quote = polishSentence(text);
    return quote ? [quote] : [];
  });
}

function cleanedCues(cues: CaptionCue[]) {
  return cues.flatMap((cue) => {
    const text = readable(cue.text)
      .replace(/(?:^|\s)\p{L}-(?=\s|$)/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text ? [{ ...cue, text }] : [];
  });
}

function momentsFromCues(cues: CaptionCue[]) {
  let joined = "";
  const marks: Array<{ index: number; startMs: number }> = [];
  for (const cue of cues) {
    const previous = joined.trim();
    const continues =
      /[,:—-]$/u.test(previous) ||
      /\b(?:and|but|or|the|a|an|to|of|into)$/iu.test(previous);
    const freshSentence =
      Boolean(previous) &&
      !/[.!?]$/u.test(previous) &&
      (/^(?:yeah|yes|yep|no|hmm+)\b/iu.test(cue.text) ||
        (/^[\p{Lu}]/u.test(cue.text) &&
          !continues &&
          wordCount(cue.text) >= 3));
    if (joined) joined += freshSentence ? ". " : " ";
    marks.push({ index: joined.length, startMs: cue.startMs });
    joined += cue.text;
  }
  const found: Array<{ moment: ChapterMoment; score: number }> = [];
  let cursor = 0;
  for (const sentence of splitSentences(joined)) {
    const at = joined.indexOf(sentence, cursor);
    cursor = at >= 0 ? at + sentence.length : cursor;
    for (const quote of clauseQuotes(sentence)) {
      const mark = marks.filter((item) => item.index <= Math.max(0, at)).at(-1);
      const matched = timeForQuote(quote, cues);
      found.push({
        moment: {
          quote,
          startMs: matched ?? (mark ? Math.round(mark.startMs) : null),
        },
        score: quoteScore(quote),
      });
    }
  }
  const unique = found.filter(
    (item, index) =>
      found.findIndex((other) => sameQuote(other.moment.quote, item.moment.quote)) ===
      index,
  );
  return pickSpread(unique);
}

function momentsFromText(text: string, cues: CaptionCue[]) {
  const found = splitSentences(readable(text))
    .map((sentence) => {
      const quote = polishSentence(sentence);
      return {
        moment: { quote, startMs: quote ? timeForQuote(quote, cues) : null },
        score: quote ? quoteScore(quote) : 0,
      };
    })
    .filter((item) => item.moment.quote);
  return pickSpread(found);
}

export function chapterMoments(input: {
  content: string;
  postcardNote?: string;
  generatedWith?: "source_text" | "gloo";
  film?: TimedFilm;
  playbackWords?: Array<{ text: string; startMs: number; endMs: number }>;
}): ChapterMoment[] {
  const recorded = filmCaptionCues(input.film);
  const cues = cleanedCues(
    recorded.length ? recorded : groupPlaybackWords(input.playbackWords || []),
  );
  const fromRecording = cues.length ? momentsFromCues(cues) : [];
  const note = polishSentence(input.postcardNote || "");
  const shapedNote =
    input.generatedWith === "gloo" &&
    note.length >= MIN_QUOTE &&
    note.length <= MAX_QUOTE &&
    !sameQuote(note, input.content)
      ? note
      : "";
  const fallback = momentsFromText(input.content, cues);
  const chosen = [...fromRecording];
  if (chosen.length < 2) {
    for (const moment of fallback) {
      if (chosen.some((item) => sameQuote(item.quote, moment.quote))) continue;
      chosen.push(moment);
      if (chosen.length === 3) break;
    }
  }
  const moments: ChapterMoment[] = [];
  if (
    shapedNote &&
    !chosen.some((moment) => sameQuote(moment.quote, shapedNote))
  )
    moments.push({
      quote: shapedNote,
      startMs: timeForQuote(shapedNote, cues),
    });
  for (const moment of chosen) {
    if (moments.some((item) => sameQuote(item.quote, moment.quote))) continue;
    moments.push(moment);
    if (moments.length === 3) break;
  }
  return moments.slice(0, 3);
}

function groupPlaybackWords(
  words: Array<{ text: string; startMs: number; endMs: number }>,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let group: typeof words = [];
  const flush = () => {
    if (!group.length) return;
    cues.push({
      text: group.map((word) => word.text).join(" "),
      startMs: group[0].startMs,
      endMs: group[group.length - 1].endMs,
    });
    group = [];
  };
  for (const word of words) {
    const length = group.map((item) => item.text).join(" ").length;
    if (group.length && (length > 90 || word.startMs - group[group.length - 1].endMs > 900))
      flush();
    group.push(word);
  }
  flush();
  return cues;
}

function timeForQuote(quote: string, cues: CaptionCue[]) {
  const needle = quote
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/u)
    .slice(0, 4)
    .join(" ");
  if (!needle) return null;
  const match = cues.find((cue) =>
    cue.text
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .includes(needle),
  );
  return match ? Math.round(match.startMs) : null;
}

export function chapterTranscript(content: string) {
  const text = readable(content);
  return text;
}

export function momentClock(startMs: number) {
  const total = Math.max(0, Math.round(startMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
