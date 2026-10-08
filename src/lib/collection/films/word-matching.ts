import type { OriginalClipSelection, SourceCaption } from "./types";

export type SourceWord = {
  text: string;
  startMs: number;
  // Providers can return an untimed lexical token. Keep its timestamps unchanged.
  // Cuts skip it and bound the clip with the nearest word that already has a duration.
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
const trailingEdgeTokens = new Set([...edgeFillers, "no", "nah", "nope"]);
/** Spoken "it" and "that" often swap between the live transcript and Scribe.
 * They are not a content swap such as Never/Always.
 */
const pronounDrift = new Set(["it", "that", "this"]);
const EDGE_DRIFT_TOKENS = 2;
const FALSE_START_TOKENS = 8;
type AlignOp =
  | { kind: "match"; wordIndex: number; query: string }
  | {
      kind: "substitute";
      wordIndex: number;
      query: string;
      source: string;
    }
  | { kind: "delete"; query: string };

/** A repeated phrase of at least two tokens, with the first copy in the
 * abandoned prefix. One repeated word is not enough: "never never" must not
 * become a license to drop the start of the thought.
 */
function repeatedPhraseOverlapsStart(tokens: string[], deletionCount: number) {
  for (let size = 2; size <= Math.floor(tokens.length / 2); size++) {
    for (let start = 0; start <= tokens.length - size * 2; start++) {
      for (let again = start + size; again <= tokens.length - size; again++) {
        let same = true;
        for (let offset = 0; offset < size; offset++) {
          if (tokens[start + offset] !== tokens[again + offset]) {
            same = false;
            break;
          }
        }
        if (same && start < deletionCount) return true;
      }
    }
  }
  return false;
}

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
    if (!sourceWordHasPositiveDuration(word))
      throw new Error(
        "A selected source word has no verified positive duration. Its original is preserved for review; no automatic cut or caption was made.",
      );
  }
}

/** A provider token with no span. Callers may skip it; they must not assign times. */
export function sourceWordHasPositiveDuration(word: SourceWord) {
  return (
    Boolean(word.text.trim()) &&
    Number.isFinite(word.startMs) &&
    Number.isFinite(word.endMs) &&
    word.startMs >= 0 &&
    word.endMs > word.startMs
  );
}

function nearestTimedEdge(
  words: SourceWord[],
  start: number,
  direction: -1 | 1,
  fallback: number,
  edge: "start" | "end",
) {
  for (
    let index = start;
    index >= 0 && index < words.length;
    index += direction
  ) {
    const word = words[index];
    if (!sourceWordHasPositiveDuration(word)) continue;
    return edge === "end" ? word.endMs : word.startMs;
  }
  return fallback;
}

/** Semi-global token alignment. Source timestamps alone determine the edit. */
function alignSourceWords(
  reference: string,
  words: SourceWord[],
  options: { allowShort?: boolean; ignoreInsertions?: boolean } = {},
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
        insertion =
          current[j - 1] + (options.ignoreInsertions ? 0 : 1);
      current[j] = Math.min(diagonal, deletion, insertion);
      trace[i * width + j] =
        current[j] === diagonal ? 1 : current[j] === deletion ? 2 : 3;
    }
    previous = current;
  }
  const bestCost = previous
    .subarray(1)
    .reduce((lowest, cost) => Math.min(lowest, cost), Infinity);
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
          ops.push({
            kind: "match",
            wordIndex: source[j - 1].wordIndex,
            query: query[i - 1],
          });
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
  // Fillers first. A content-word opening is accepted only when the written
  // answer itself restarts that phrase, and the recording did not keep the
  // abandoned attempt. The cut then begins at the verified restart.
  const leadingBoundary = (ops: AlignOp[]) => {
    const fillers = edgeDrift(ops, leadingEdgeTokens);
    if (fillers) return fillers;
    const extra: number[] = [];
    let index = 0;
    let consumed = 0;
    while (
      index < ops.length &&
      ops[index].kind !== "match" &&
      consumed < EDGE_DRIFT_TOKENS
    ) {
      const op = ops[index];
      if (op.kind === "delete" && leadingEdgeTokens.has(op.query)) {
        consumed++;
        index++;
        continue;
      }
      if (
        op.kind === "substitute" &&
        leadingEdgeTokens.has(op.query) &&
        leadingEdgeTokens.has(op.source)
      ) {
        consumed++;
        extra.push(op.wordIndex);
        index++;
        continue;
      }
      break;
    }
    const deleted: string[] = [];
    while (
      index < ops.length &&
      ops[index].kind === "delete" &&
      deleted.length < FALSE_START_TOKENS
    ) {
      deleted.push(ops[index].query);
      index++;
    }
    if (!deleted.length || ops[index]?.kind !== "match") return null;
    const following: string[] = [];
    for (
      let cursor = index;
      cursor < ops.length && following.length < FALSE_START_TOKENS;
      cursor++
    ) {
      if (ops[cursor].kind !== "match") break;
      following.push(ops[cursor].query);
    }
    if (
      !repeatedPhraseOverlapsStart([...deleted, ...following], deleted.length)
    )
      return null;
    return extra;
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
  // A one-for-one Never/Always swap does not match. A longer written opener
  // against a single different source word can start at the shared phrase.
  const disputedOpening = (ops: AlignOp[]) => {
    let queryCount = 0;
    let sourceCount = 0;
    let index = 0;
    while (index < ops.length && ops[index].kind !== "match") {
      const op = ops[index];
      if (op.kind === "delete") queryCount++;
      else if (op.kind === "substitute") {
        queryCount++;
        sourceCount++;
      } else return null;
      index++;
    }
    if (
      !index ||
      index === ops.length ||
      sourceCount !== 1 ||
      queryCount < 3 ||
      !ops.slice(index).every((op) => op.kind === "match")
    )
      return null;
    return [] as number[];
  };
  const pronounEdge = (ops: AlignOp[]) => {
    const first = ops[0];
    if (
      first?.kind !== "substitute" ||
      !pronounDrift.has(first.query) ||
      !pronounDrift.has(first.source) ||
      !ops.slice(1).every((op) => op.kind === "match")
    )
      return null;
    return [first.wordIndex];
  };
  const trailingOnly =
    best.ops.length > 1 &&
    best.ops.at(-1)?.kind === "delete" &&
    best.ops.slice(0, -1).every((op) => op.kind === "match");
  const relaxed = Boolean(
    disputedOpening(best.ops) || pronounEdge(best.ops) || trailingOnly,
  );
  if (!relaxed && bestCost / query.length > 0.1)
    throw new Error(
      "The saved answer could not be matched confidently to its original recording. No automatic cut was made.",
    );
  if (!relaxed && (best.matched / query.length < 0.9 || !best.indices.length))
    throw new Error(
      "The source-word match did not preserve enough of the complete answer.",
    );
  // One written token the recording never said. The cut ends on the last
  // verified source word. A second extra token, or a content substitution,
  // still fails.
  const trailingUnspoken = (candidate: { ops: AlignOp[]; end: number }) => {
    const reversed = [...candidate.ops].reverse();
    if (reversed[0]?.kind !== "delete" || reversed[1]?.kind !== "match")
      return null;
    const deleted = reversed[0].query;
    const next = source[candidate.end]?.text;
    // "know" must not be dropped in front of a spoken "no".
    const shorter = next && next.length < deleted.length ? next : deleted;
    const longer = next && shorter === next ? deleted : next;
    if (next && shorter.length >= 2 && longer?.includes(shorter)) return null;
    return [] as number[];
  };
  const leadingOf = (ops: AlignOp[]) =>
    pronounEdge(ops) ?? disputedOpening(ops) ?? leadingBoundary(ops);
  const trailingOf = (candidate: { ops: AlignOp[]; end: number }) =>
    edgeDrift([...candidate.ops].reverse(), trailingEdgeTokens) ??
    trailingUnspoken(candidate);
  const verified = candidates
    .filter((candidate) => leadingOf(candidate.ops) && trailingOf(candidate))
    .sort(
      (left, right) => right.end - right.start - (left.end - left.start),
    )[0];
  const leading = verified && leadingOf(verified.ops);
  const trailing = verified && trailingOf(verified);
  if (!verified || !leading || !trailing)
    throw new Error(
      "The complete answer boundaries could not be verified. No partial-thought cut was made.",
    );
  const indices = [...new Set([...verified.indices, ...leading, ...trailing])];
  const first = Math.min(...indices),
    last = Math.max(...indices);
  const enclosingPassage = words.slice(first, last + 1);
  // Keep all interior timed words, but remove duplicate rollover edges only when
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
  // An untimed token has no span, so it cannot move a cut. Leave its timestamps
  // untouched and continue with the timed words around it.
  let passage = enclosingPassage.filter((word, offset) => {
    const bound = bounds.get(word.mediaId);
    return (
      bound &&
      first + offset >= bound[0] &&
      first + offset <= bound[1] &&
      sourceWordHasPositiveDuration(word)
    );
  });
  if (!passage.length)
    throw new Error(
      "A selected source word has no verified positive duration. Its original is preserved for review; no automatic cut or caption was made.",
    );
  assertTimedSourceWords(passage);
  // Diarization is evidence only, never a guess about a person's identity.
  // A second voice (often the interviewer through the speakers) must not stop the cut.
  const droppedSpeakers = new Set<SourceWord>();
  for (const mediaId of new Set(passage.map((word) => word.mediaId))) {
    const speakers = new Map<string, number>();
    for (const word of passage) {
      if (word.mediaId !== mediaId || !word.speakerId) continue;
      speakers.set(word.speakerId, (speakers.get(word.speakerId) ?? 0) + 1);
    }
    if (speakers.size <= 1) continue;
    const ranked = [...speakers.entries()].sort(
      (left, right) => right[1] - left[1],
    );
    const dominant = ranked[0][0];
    const fileWords = passage.filter((word) => word.mediaId === mediaId);
    const flicker = fileWords.every((word, index) => {
      if (!word.speakerId || word.speakerId === dominant) return true;
      return index < 3 || index === fileWords.length - 1;
    });
    // Edge flicker stays in the passage. A tie also stays, rather than blocking.
    if (flicker || ranked[0][1] < ranked[1][1] * 1.5) continue;
    for (const word of fileWords)
      if (word.speakerId && word.speakerId !== dominant)
        droppedSpeakers.add(word);
  }
  if (droppedSpeakers.size) {
    const kept = passage.filter((word) => !droppedSpeakers.has(word));
    if (kept.length) passage = kept;
  }
  // A room recording labels the interviewer as the same speaker. Extra words
  // between the saved answer are not part of the cut when they form a real gap.
  if (options.ignoreInsertions) {
    const matched = new Set(indices);
    const isMatched = passage.map((word) => matched.has(words.indexOf(word)));
    const nextMatched: number[] = new Array(passage.length).fill(passage.length);
    let upcoming = passage.length;
    for (let offset = passage.length - 1; offset >= 0; offset--) {
      nextMatched[offset] = upcoming;
      if (isMatched[offset]) upcoming = offset;
    }
    let previous = -1;
    passage = passage.filter((word, offset) => {
      if (isMatched[offset]) {
        previous = offset;
        return true;
      }
      const next = nextMatched[offset];
      if (previous < 0 || next >= passage.length) return false;
      const before = passage[previous];
      const after = passage[next];
      return (
        word.mediaId === before.mediaId &&
        after.mediaId === before.mediaId &&
        after.startMs - before.endMs <= 900
      );
    });
  }
  return {
    words: passage,
    firstWordIndex: first,
    lastWordIndex: last,
    confidence: 1 - bestCost / query.length,
  };
}

type MatchOptions = {
  allowShort?: boolean;
  speakerSubset?: boolean;
  ignoreInsertions?: boolean;
};

function speakerDuration(words: SourceWord[], speaker: string) {
  return words.reduce((total, word) => {
    if (word.speakerId !== speaker) return total;
    const span = word.endMs - word.startMs;
    return total + (Number.isFinite(span) && span > 0 ? span : 1);
  }, 0);
}

/** Interviewer words between a saved answer are insertions. They can exceed the
 * confidence limit before the later speaker drop runs. Retry each labeled
 * speaker, plus unlabeled words, and keep a unique match.
 */
function matchSavedAnswerOnOneSpeaker(
  reference: string,
  words: SourceWord[],
  options: MatchOptions,
  error: unknown,
) {
  if (options.speakerSubset || !(error instanceof Error)) return null;
  if (
    !/could not be matched confidently|did not preserve enough of the complete answer|boundaries could not be verified|more than once/.test(
      error.message,
    )
  )
    return null;
  const speakers = [
    ...new Set(words.map((word) => word.speakerId).filter(Boolean)),
  ] as string[];
  if (speakers.length < 2) return null;
  const successes: {
    speaker: string;
    duration: number;
    match: ReturnType<typeof alignSourceWords>;
  }[] = [];
  for (const speaker of speakers) {
    const subset = words.filter(
      (word) => !word.speakerId || word.speakerId === speaker,
    );
    if (!subset.length || subset.length === words.length) continue;
    try {
      const aligned = matchSourceWords(reference, subset, {
        ...options,
        speakerSubset: true,
      });
      const firstWord = subset[aligned.firstWordIndex];
      const lastWord = subset[aligned.lastWordIndex];
      const firstWordIndex = words.indexOf(firstWord);
      const lastWordIndex = words.indexOf(lastWord);
      if (firstWordIndex < 0 || lastWordIndex < firstWordIndex) continue;
      successes.push({
        speaker,
        duration: speakerDuration(words, speaker),
        match: {
          ...aligned,
          firstWordIndex,
          lastWordIndex,
        },
      });
    } catch {
      // This speaker does not contain the saved answer.
    }
  }
  if (!successes.length) return null;
  // A real repeated passage still cannot choose a speaker. Interviewer audio
  // only explains the duplicate when one speaker contains the saved answer.
  if (/more than once/.test(error.message))
    return successes.length === 1 ? successes[0].match : null;
  successes.sort(
    (left, right) =>
      right.match.confidence - left.match.confidence ||
      right.duration - left.duration ||
      left.speaker.localeCompare(right.speaker),
  );
  const best = successes[0];
  const next = successes[1];
  if (
    !next ||
    best.match.confidence > next.match.confidence ||
    best.duration >= next.duration * SPEAKER_MAJORITY
  )
    return best.match;
  return null;
}

/** Semi-global token alignment. Source timestamps alone determine the edit. */
export function matchSourceWords(
  reference: string,
  words: SourceWord[],
  options: MatchOptions = {},
) {
  try {
    return alignSourceWords(reference, words, options);
  } catch (error) {
    const spoken = matchSavedAnswerOnOneSpeaker(
      reference,
      words,
      options,
      error,
    );
    if (spoken) return spoken;
    // A written prefix the recording replaced with a filler ("I had" / "uh").
    // Dropping it is accepted only when the kept source words are fillers.
    // An unrepeated content prefix with nothing spoken in its place still fails.
    if (options.allowShort) throw error;
    const parts = reference.trim().split(/\s+/);
    for (let drop = 1; drop <= 2 && drop < parts.length; drop++) {
      const suffix = parts.slice(drop).join(" ");
      if (sourceTokenCount(suffix) < 4) continue;
      try {
        const aligned = alignSourceWords(suffix, words, options);
        const skipped = words.slice(0, aligned.firstWordIndex);
        if (
          !skipped.length ||
          aligned.firstWordIndex !== skipped.length ||
          skipped.some(
            (word) =>
              !tokens(word.text).every((token) => leadingEdgeTokens.has(token)),
          )
        )
          continue;
        const kept = [...skipped, ...aligned.words].filter(
          sourceWordHasPositiveDuration,
        );
        if (!kept.length) continue;
        return {
          ...aligned,
          words: kept,
          firstWordIndex: 0,
        };
      } catch {
        continue;
      }
    }
    throw error;
  }
}

const SPEAKER_MAJORITY = 1.5;

/** Bump when alignment can resolve an older confident-match failure without new audio. */
export const SOURCE_MATCH_REVISION = 3;

/** Spoken duration of each diarized speaker. Unlabeled words are not a speaker. */
export function dominantSpeaker(words: SourceWord[]): string | null {
  const weights = new Map<string, number>();
  for (const word of words) {
    if (!word.speakerId) continue;
    const span = word.endMs - word.startMs;
    const weight = Number.isFinite(span) && span > 0 ? span : 1;
    weights.set(word.speakerId, (weights.get(word.speakerId) ?? 0) + weight);
  }
  const ranked = [...weights.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  if (!ranked.length) return null;
  if (ranked.length === 1 || ranked[0][1] >= ranked[1][1] * SPEAKER_MAJORITY)
    return ranked[0][0];
  return null;
}

/** Keep one clear speaker and any unlabeled words. A tie keeps the full passage. */
export function storytellerWords(words: SourceWord[]): SourceWord[] {
  const speaker = dominantSpeaker(words);
  if (!speaker) return words;
  const kept = words.filter(
    (word) => !word.speakerId || word.speakerId === speaker,
  );
  return kept.length ? kept : words;
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

function matchedWordsShouldSplit(
  allWords: SourceWord[],
  left: SourceWord,
  right: SourceWord,
) {
  if (left.mediaId !== right.mediaId) return false;
  if (right.startMs - left.endMs > 900) {
    const file = allWords.filter((word) => word.mediaId === left.mediaId);
    const start = file.indexOf(left);
    const end = file.indexOf(right);
    if (start >= 0 && end > start + 1) return true;
  }
  const kept = [left.speakerId, right.speakerId].filter(Boolean);
  if (!kept.length) return false;
  const sameFile = allWords.filter((word) => word.mediaId === left.mediaId);
  const start = sameFile.indexOf(left);
  const end = sameFile.indexOf(right);
  if (start < 0 || end <= start + 1) return false;
  return sameFile
    .slice(start + 1, end)
    .some((word) => word.speakerId && !kept.includes(word.speakerId));
}

export function cutsForMatchedWords(
  words: SourceWord[],
  allWords: SourceWord[],
  durations: Map<string, number>,
): OriginalClipSelection[] {
  assertTimedSourceWords(words);
  const groups: SourceWord[][] = [];
  for (const word of words) {
    const previous = groups.at(-1)?.at(-1);
    if (
      !previous ||
      previous.mediaId !== word.mediaId ||
      matchedWordsShouldSplit(allWords, previous, word)
    )
      groups.push([word]);
    else groups.at(-1)!.push(word);
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
    const labeled = new Set(
      group.map((word) => word.speakerId).filter(Boolean),
    );
    const groupSpeaker = labeled.size === 1 ? [...labeled][0] : null;
    const previous = sameFile[first - 1];
    const next = sameFile[last + 1];
    const otherNeighbor = (word?: SourceWord) =>
      Boolean(
        word?.speakerId && groupSpeaker && word.speakerId !== groupSpeaker,
      );
    if (otherNeighbor(previous) || otherNeighbor(next)) {
      const groupStart = group[0].startMs;
      const groupEnd = Math.max(...group.map((word) => word.endMs));
      let inMs = Math.max(0, groupStart - 140);
      let outMs = Math.min(durationMs!, groupEnd + 180);
      if (previous && otherNeighbor(previous))
        inMs =
          previous.endMs <= groupStart
            ? Math.max(inMs, previous.endMs)
            : groupStart;
      if (next && otherNeighbor(next))
        outMs =
          next.startMs >= groupEnd ? Math.min(outMs, next.startMs) : groupEnd;
      if (!(outMs > inMs))
        throw new Error(
          "A selected passage needs verified original source bounds.",
        );
      return {
        mediaId,
        inMs,
        outMs,
        captions: captionsForWords(group),
      };
    }
    // Untimed tokens inside the span are skipped. They are not given a duration,
    // and they are not used as the edge of the continuous cut.
    const span = sameFile.slice(first, last + 1);
    const timedSpan = span.filter(sourceWordHasPositiveDuration);
    if (!timedSpan.length) assertTimedSourceWords(span);
    assertTimedSourceWords(timedSpan);
    // The nearest word that already has a positive duration supplies the bound.
    // An adjacent untimed token keeps its original timestamps and is not used.
    const before = nearestTimedEdge(sameFile, first - 1, -1, 0, "end");
    const after = nearestTimedEdge(sameFile, last + 1, 1, durationMs!, "start");
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
