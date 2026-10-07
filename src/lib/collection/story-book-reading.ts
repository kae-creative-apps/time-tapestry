import { cleanTranscriptForReading, quotedRanges } from "./transcript-reading";

const BACKCHANNEL =
  /^(?:hmm+|yeah+|yep|yup|yes|sorry|okay|ok|right|uh-huh|mm+|mhm)\.?$/iu;

/** A reading copy for the book. It deletes spoken noise and adds no words. */
export function cleanStoryBookText(source: string, shaped = false): string {
  const original = source.replace(/\r\n?/g, "\n").trim();
  if (!original) return original;
  let text = cleanTranscriptForReading(original).text;
  text = replaceOutsideQuotes(text, (part) =>
    part
      .replace(
        /(?<![\p{L}\p{N}_’'\-])(?:[Uu]m+|[Uu]h+|[Ee]rm|[Ee]r+)(?:\.{2,}|…)(?![\p{L}\p{N}_’'\-])/gu,
        "",
      )
      .replace(/,?\s+you know,/giu, ",")
      .replace(/,\s*like,/giu, ",")
      .replace(/\b([\p{L}][\p{L}’']*)(?:,)?\s+\1\b/giu, "$1")
      .replace(/,\s*(?:and|but|so)\.{2,}\s*/giu, ". ")
      .replace(/\s+(?:and|but|so)\.{2,}(?=\s|$)/giu, "")
      .replace(/\b(and|but|so)\s+\1\b/giu, "$1"),
  );
  if (!shaped) {
    text = replaceOutsideQuotes(text, (part) =>
      part.replace(/(^|[\s])[\p{L}]{1,2}-\s+/gu, "$1"),
    );
    text = text
      .split(/\n+/u)
      .flatMap((paragraph) => {
        const sentences = paragraph
          .split(/(?<=[.!?])\s+/u)
          .map((sentence) => sentence.trim())
          .filter(
            (sentence) =>
              sentence &&
              !BACKCHANNEL.test(sentence) &&
              !/^(?:and|but|so)?\s*(?:\.{2,}|…)$/iu.test(sentence),
          );
        const next = sentences.join(" ").trim();
        return next ? [next] : [];
      })
      .join("\n\n");
  }
  text = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/,\s*(?=[.!?])/g, "")
    .split(/\n+/u)
    .map((paragraph) =>
      paragraph
        .trim()
        .replace(/^(\p{Ll})/u, (letter) => letter.toLocaleUpperCase())
        .replace(
          /([.!?]\s+)(\p{Ll})/gu,
          (_, lead: string, letter: string) =>
            lead + letter.toLocaleUpperCase(),
        ),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return original;
  return text;
}

function replaceOutsideQuotes(
  source: string,
  edit: (part: string) => string,
): string {
  const ranges = quotedRanges(source);
  let cursor = 0;
  let result = "";
  for (const range of ranges) {
    result += edit(source.slice(cursor, range.start));
    result += source.slice(range.start, range.end);
    cursor = range.end;
  }
  result += edit(source.slice(cursor));
  return result;
}
