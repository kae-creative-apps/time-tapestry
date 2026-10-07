import type { OriginalClipSelection, SourceCaption } from "./types";

export type SourceWord = {
  text: string;
  startMs: number;
  // Providers can return an untimed lexical token. Keep it for source alignment,
  // but it cannot authorize a selected passage, caption or edit boundary.
  endMs: number;
  mediaId: string;
  speakerId?: string;
  /** Provider-detected language. Unknown language cannot authorize lexical cuts. */
  languageCode?: string;
};
/** Fillers and backchannels that are not the start or end of a thought.
 * A content word such as "never" is intentionally absent.
 */
const edgeFillers = new Set([
  "um",
  "uh",
  "uhh",
  "uhm",
  "erm",
  "er",
  "hmm",
  "hm",
  "mm",
  "mmm",
  "mhm",
  "mhmm",
  "ah",
  "ahh",
  "oh",
  "ohh",
  "eh",
  "yeah",
  "yea",
  "yes",
  "yep",
  "yup",
  "yah",
  "okay",
  "ok",
  "alright",
  "anyway",
  "anyways",
]);
/** Interview openers the written answer often keeps and Scribe often drops.
 * They are not accepted at the end, where the same spellings can be content.
 */
const leadingEdgeTokens = new Set([
  ...edgeFillers,
  "well",
  "so",
  "and",
  "but",
  "just",
  "actually",
  "like",
  "right",
]);
const EDGE_DRIFT_TOKENS = 2;
type AlignOp =
  | { kind: "match"; wordIndex: number }
  | {
      kind: "substitute";
      wordIndex: number;
      query: string;
      source: string;
    }
  | { kind: "delete"; query: string };

const contractions: Record<string, string[]> = {
  "i'm": ["i", "am"],
  "it's": ["it", "is"],
  "don't": ["do", "not"],
  "didn't": ["did", "not"],
  "can't": ["can", "not"],
  cannot: ["can", "not"],
  "wasn't": ["was", "not"],
  "we're": ["we", "are"],
  "i've": ["i", "have"],
  "that's": ["that", "is"],
  "i'd": ["i", "would"],
};
const tokens = (text: string) =>
  (
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  ).flatMap((word) => contractions[word] ?? [word]);

export const sourceTokenCount = (text: string) => tokens(text).length;

export function validateSourceWords(
  words: SourceWord[],
  durationMs: number,
  mediaId: string,
) {
  let previous = 0;
  if (!words.length || words.length > 60000)
    throw new Error("The transcription did not contain usable source words.");
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error(
      "The original recording needs a measured positive duration.",
    );
  for (const word of words) {
    if (
      word.mediaId !== mediaId ||
      !word.text.trim() ||
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < previous ||
      word.endMs < word.startMs ||
      word.endMs > durationMs
    )
      throw new Error(
        "The transcription returned timestamps outside the measured original recording.",
      );
    previous = word.startMs;
  }
  return words;
}

/** Selected speech requires real positive spans, even when source search contains
 * an unchanged untimed token. Overlapping positive spans remain supported.
 */
export function assertTimedSourceWords(words: SourceWord[]) {
  for (const word of words) {
    if (
      !word.text.trim() ||
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < 0 ||
      word.endMs <= word.startMs
    )
      throw new Error(
        "A selected source word has no verified positive duration. Its original is preserved for review; no automatic cut or caption was made.",
      );
  }
}

/** Semi-global token alignment. Source timestamps alone determine the edit. */
export function matchSourceWords(
  reference: string,
  words: SourceWord[],
  options: { allowShort?: boolean } = {},
) {
  const query = tokens(reference);
  const source = words.flatMap((word, wordIndex) =>
    tokens(word.text).map((text) => ({ text, wordIndex })),
  );
  if (query.length < (options.allowShort ? 1 : 4))
    throw new Error(
      "A recorded answer is too short to match uniquely. Its original remains available for recovery.",
    );
  if (!source.length || (query.length + 1) * (source.length + 1) > 24000000)
    throw new Error(
      "This answer needs a smaller source search or an editor check before automatic cuts can be verified.",
    );
  const width = source.length + 1;
  const trace = new Uint8Array((query.length + 1) * width);
  let previous = new Uint16Array(width);
  for (let i = 1; i <= query.length; i++) {
    const current = new Uint16Array(width);
    current[0] = i;
    for (let j = 1; j < width; j++) {
      const diagonal =
        previous[j - 1] + (query[i - 1] === source[j - 1].text ? 0 : 1);
      const deletion = previous[j] + 1,
        insertion = current[j - 1] + 1;
      current[j] = Math.min(diagonal, deletion, insertion);
      trace[i * width + j] =
        current[j] === diagonal ? 1 : current[j] === deletion ? 2 : 3;
    }
    previous = current;
  }
  const bestCost = previous
    .subarray(1)
    .reduce((lowest, cost) => Math.min(lowest, cost), Infinity);
  if (bestCost / query.length > 0.1)
    throw new Error(
      "The saved answer could not be matched confidently to its original recording. No automatic cut was made.",
    );
  const traceMatch = (end: number) => {
    let i = query.length,
      j = end,
      matched = 0;
    const indices: number[] = [];
    const ops: AlignOp[] = [];
    while (i > 0 && j > 0) {
      const step = trace[i * width + j];
      if (step === 1) {
        if (query[i - 1] === source[j - 1].text) {
          matched++;
          indices.push(source[j - 1].wordIndex);
          ops.push({ kind: "match", wordIndex: source[j - 1].wordIndex });
        } else
          ops.push({
            kind: "substitute",
            wordIndex: source[j - 1].wordIndex,
            query: query[i - 1],
            source: source[j - 1].text,
          });
        i--;
        j--;
      } else if (step === 2) {
        ops.push({ kind: "delete", query: query[i - 1] });
        i--;
      } else j--;
    }
    while (i > 0) {
      ops.push({ kind: "delete", query: query[i - 1] });
      i--;
    }
    ops.reverse();
    return { start: j, end, matched, indices, ops };
  };
  const edgeDrift = (ops: AlignOp[], allowed: Set<string>) => {
    const extra: number[] = [];
    let consumed = 0;
    for (const op of ops) {
      if (op.kind === "match") return extra;
      if (consumed >= EDGE_DRIFT_TOKENS) return null;
      if (op.kind === "delete") {
        if (!allowed.has(op.query)) return null;
        consumed++;
        continue;
      }
      if (!allowed.has(op.query) || !allowed.has(op.source)) return null;
      consumed++;
      extra.push(op.wordIndex);
    }
    return null;
  };
  const endpoints = Array.from(previous)
    .map((cost, j) => ({ cost, j }))
    .filter(({ cost, j }) => j > 0 && cost === bestCost);
  const candidates = endpoints.map(({ j }) => traceMatch(j));
  const best = candidates[0];
  for (const alternative of candidates.slice(1)) {
    const overlap = Math.max(
      0,
      Math.min(best.end, alternative.end) -
        Math.max(best.start, alternative.start),
    );
    if (
      overlap <
      Math.min(best.end - best.start, alternative.end - alternative.start) / 2
    )
      throw new Error(
        "The same answer occurs more than once in its recordings. Automatic editing could not choose a unique passage.",
      );
  }
  if (best.matched / query.length < 0.9 || !best.indices.length)
    throw new Error(
      "The source-word match did not preserve enough of the complete answer.",
    );
  const verified = candidates
    .filter(
      (candidate) =>
        edgeDrift(candidate.ops, leadingEdgeTokens) &&
        edgeDrift([...candidate.ops].reverse(), edgeFillers),
    )
    .sort(
      (left, right) => right.end - right.start - (left.end - left.start),
    )[0];
  const leading = verified && edgeDrift(verified.ops, leadingEdgeTokens);
  const trailing =
    verified && edgeDrift([...verified.ops].reverse(), edgeFillers);
  if (!verified || !leading || !trailing)
    throw new Error(
      "The complete answer boundaries could not be verified. No partial-thought cut was made.",
    );
  const indices = [...new Set([...verified.indices, ...leading, ...trailing])];
  const first = Math.min(...indices),
    last = Math.max(...indices);
  const enclosingPassage = words.slice(first, last + 1);
  // Verify the entire matched interval before rollover filtering. Otherwise an
  // untimed unmatched file-edge token could disappear within the text allowance.
  assertTimedSourceWords(enclosingPassage);
  // Keep all interior words, but remove duplicate rollover edges only when
  // alignment actually matched them in the neighboring source file.
  const bounds = new Map<string, [number, number]>();
  for (const index of indices) {
    const id = words[index].mediaId,
      bound = bounds.get(id);
    bounds.set(id, [
      Math.min(bound?.[0] ?? index, index),
      Math.max(bound?.[1] ?? index, index),
    ]);
  }
  const passage = enclosingPassage.filter((word, offset) => {
    const bound = bounds.get(word.mediaId);
    return bound && first + offset >= bound[0] && first + offset <= bound[1];
  });
  // Includes every retained interior word, not just the tokens the alignment
  // matched. An untimed word cannot be hidden by the permitted text mismatch.
  assertTimedSourceWords(passage);
  // Diarization is evidence only, never a guess about a person's identity.
  for (const mediaId of new Set(passage.map((word) => word.mediaId))) {
    const speakers = new Set(
      passage
        .filter((word) => word.mediaId === mediaId && word.speakerId)
        .map((word) => word.speakerId),
    );
    if (speakers.size > 1)
      throw new Error(
        "This matched passage contains more than one detected speaker. It needs review before a clean storyteller-only cut can be made.",
      );
  }
  return {
    words: passage,
    firstWordIndex: first,
    lastWordIndex: last,
    confidence: 1 - bestCost / query.length,
  };
}

export function captionsForWords(words: SourceWord[]): SourceCaption[] {
  assertTimedSourceWords(words);
  const captions: SourceCaption[] = [];
  let group: SourceWord[] = [];
  const flush = () => {
    if (group.length)
      captions.push({
        text: group.map((word) => word.text).join(" "),
        startMs: group[0].startMs,
        endMs: Math.max(...group.map((word) => word.endMs)),
        timestampMs: null,
        confidence: null,
      });
    group = [];
  };
  for (const word of words) {
    if (
      group.length &&
      word.startMs >= Math.max(...group.map((item) => item.endMs)) &&
      (group.map((item) => item.text).join(" ").length + word.text.length >
        72 ||
        word.endMs - group[0].startMs > 4500 ||
        word.startMs - group.at(-1)!.endMs > 900)
    )
      flush();
    group.push(word);
  }
  flush();
  return captions;
}

export function cutsForMatchedWords(
  words: SourceWord[],
  allWords: SourceWord[],
  durations: Map<string, number>,
): OriginalClipSelection[] {
  assertTimedSourceWords(words);
  const groups: SourceWord[][] = [];
  for (const word of words) {
    if (!groups.length || groups.at(-1)!.at(-1)!.mediaId !== word.mediaId)
      groups.push([]);
    groups.at(-1)!.push(word);
  }
  return groups.map((group) => {
    const mediaId = group[0].mediaId;
    const sameFile = allWords.filter((word) => word.mediaId === mediaId);
    const first = sameFile.indexOf(group[0]),
      last = sameFile.indexOf(group.at(-1)!);
    const durationMs = durations.get(mediaId);
    if (
      first < 0 ||
      last < first ||
      !Number.isFinite(durationMs) ||
      durationMs! <= 0 ||
      group.some((word) => word.endMs > durationMs!)
    )
      throw new Error(
        "A selected passage needs verified original source bounds.",
      );
    // A direct caller must not omit an untimed original token while asking for
    // one continuous cut around it.
    assertTimedSourceWords(sameFile.slice(first, last + 1));
    // An adjacent untimed lexical token cannot prove where excluded speech ends
    // or begins. Do not assign it a duration or cut through a guessed boundary.
    assertTimedSourceWords([
      ...(first > 0 ? [sameFile[first - 1]] : []),
      ...(last + 1 < sameFile.length ? [sameFile[last + 1]] : []),
    ]);
    const before = first > 0 ? sameFile[first - 1].endMs : 0;
    const after =
      last >= 0 && last + 1 < sameFile.length
        ? sameFile[last + 1].startMs
        : durationMs!;
    const groupEnd = Math.max(...group.map((word) => word.endMs));
    if (before > group[0].startMs || after < groupEnd)
      throw new Error(
        "Overlapping source words need review before a cut can preserve the complete words.",
      );
    return {
      mediaId,
      inMs: Math.max(0, before, group[0].startMs - 140),
      outMs: Math.min(durationMs!, after, groupEnd + 180),
      captions: captionsForWords(group),
    };
  });
}

/** Deduplicate only text proven to be from an overlapping capture interval.
 * Message arrival times are never used. A pause or a repeated later memory
 * has no capture overlap, so it remains intact.
 */
export function sessionWordTimeline(
  segments: { mediaId: string; startMs: number }[],
  wordsByMedia: Map<string, SourceWord[]>,
  durations: Map<string, number>,
) {
  const ordered = [...segments].sort((a, b) => a.startMs - b.startMs);
  const allWords: SourceWord[] = [],
    matchableWords: SourceWord[] = [];
  const seen = new Set<string>();
  let previous: (typeof ordered)[number] | undefined;
  for (const segment of ordered) {
    if (seen.has(segment.mediaId)) continue;
    seen.add(segment.mediaId);
    const words = wordsByMedia.get(segment.mediaId) ?? [];
    allWords.push(...words);
    let skip = 0;
    if (previous && words.length) {
      const previousWords = wordsByMedia.get(previous.mediaId) ?? [];
      const overlapEnd =
        previous.startMs + (durations.get(previous.mediaId) ?? 0);
      if (overlapEnd > segment.startMs) {
        // Two matching timed words are required. A single common word is not
        // sufficient evidence to erase an utterance at a recording boundary.
        for (
          let count = Math.min(30, previousWords.length, words.length);
          count >= 2;
          count--
        ) {
          const tail = previousWords.slice(-count),
            head = words.slice(0, count);
          if (
            head.every((word, index) => {
              const prior = tail[index];
              return (
                word.endMs > word.startMs &&
                prior.endMs > prior.startMs &&
                tokens(word.text).join(" ") === tokens(prior.text).join(" ") &&
                word.endMs + segment.startMs <= overlapEnd + 150 &&
                prior.startMs + previous!.startMs >= segment.startMs - 150 &&
                Math.abs(
                  word.startMs +
                    segment.startMs -
                    prior.startMs -
                    previous!.startMs,
                ) <= 300 &&
                Math.abs(
                  word.endMs +
                    segment.startMs -
                    prior.endMs -
                    previous!.startMs,
                ) <= 300
              );
            })
          ) {
            skip = count;
            break;
          }
        }
      }
    }
    matchableWords.push(...words.slice(skip));
    previous = segment;
  }
  return { allWords, matchableWords };
}
