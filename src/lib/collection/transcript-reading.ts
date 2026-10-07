export type TranscriptReading = {
  text: string;
  removedFillers: number;
};

export function quotedRanges(source: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let open: { start: number; close: string } | undefined;
  const word = (character: string | undefined) =>
    Boolean(character && /[\p{L}\p{N}]/u.test(character));
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const apostropheInWord =
      (character === "'" || character === "’") &&
      word(source[index - 1]) &&
      word(source[index + 1]);
    if (open) {
      if (character === open.close && !apostropheInWord) {
        ranges.push({ start: open.start, end: index + 1 });
        open = undefined;
      }
    } else if (character === '"' || character === "`") {
      open = { start: index, close: character };
    } else if (character === "“" || character === "‘") {
      open = { start: index, close: character === "“" ? "”" : "’" };
    } else if (character === "'" && !word(source[index - 1])) {
      open = { start: index, close: "'" };
    }
  }
  if (open) ranges.push({ start: open.start, end: source.length });
  return ranges;
}

/** A reading copy only. Never persist this over a transcript or use it as timing data. */
export function cleanTranscriptForReading(source: string): TranscriptReading {
  // Quoted sounds can be part of the story itself. Apostrophes within words do
  // not open quotations. Incomplete quotations are intentionally left alone too.
  const quoted = quotedRanges(source);
  const removals = Array.from(
    source.matchAll(
      /(?<![\p{L}\p{N}_’'\-])(?:[Uu]m+|[Uu]h+)(?![\p{L}\p{N}_’'\-])/gu,
    ),
  ).filter((match) => {
    const start = match.index!;
    if (quoted.some((range) => start >= range.start && start < range.end))
      return false;
    const following = source.slice(start + match[0].length);
    // An emphasized sound or an ellipsis can carry doubt or disagreement.
    if (/^[ \t]*(?:[?!…]|\.{2,})/.test(following)) return false;
    if (/^\./.test(following) && !source.slice(0, start).trim()) return false;
    // Preserve mentions of a word and ambiguous names such as "Um Lee".
    if (
      /\b(?:word|term|spell|spelled|spelling|named|called)\s+$/i.test(
        source.slice(0, start),
      )
    )
      return false;
    if (/^[A-Z]/.test(match[0]) && /^[ \t]+[A-Z]/.test(following)) return false;
    return true;
  });
  if (!removals.length) return { text: source, removedFillers: 0 };

  let text = source;
  // Reverse order keeps every source index stable while nearby punctuation is
  // joined. All uses of "like", uncertainty and repeated emphasis stay intact.
  for (const match of removals.reverse()) {
    let start = match.index!;
    let end = start + match[0].length;
    const precedingComma = text.slice(0, start).match(/,[ \t]*$/);
    if (precedingComma) start -= precedingComma[0].length;
    const followingComma = text.slice(end).match(/^[ \t]*,/);
    if (followingComma) end += followingComma[0].length;
    const left = text.slice(0, start).replace(/[ \t]+$/, "");
    const right = text.slice(end).replace(/^[ \t]+/, "");
    const space =
      left && right && !/[\n(]$/.test(left) && !/^[\n.,!?;:)]/.test(right)
        ? " "
        : "";
    text = left + space + right;
  }
  // A hesitation-only answer has no safe replacement. Keep it for review.
  if (!/[\p{L}\p{N}]/u.test(text)) return { text: source, removedFillers: 0 };
  return { text, removedFillers: removals.length };
}
