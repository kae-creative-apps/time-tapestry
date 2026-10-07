import { cleanTranscriptForReading, quotedRanges } from "./transcript-reading";

const LEADING =
  /^(?:yeah|yes|yep|yup|no|hmm+|oh|ah|uh+|um+|so|and|but|well|okay|ok|sorry|like|probably|just)[,.]?\s+/iu;
const ASIDE =
  /^(?:yeah|yes|yep|yup|no|hmm+|oh|ah|okay|ok|sorry|snappy|what|hey|huh|right|uh-huh|mm+|mhm|super kind)[.!?]?$/iu;

/** A reading copy for the book. It deletes spoken noise and adds no words. */
export function cleanStoryBookText(source: string, shaped = false): string {
  const original = source.replace(/\r\n?/g, "\n").trim();
  if (!original) return original;
  let text = cleanTranscriptForReading(original).text;
  text = replaceOutsideQuotes(text, (part) =>
    part
      .replace(
        /(?<![\p{L}\p{N}_’'\-])(?:[Uu]m+|[Uu]h+|[Ee]rm|[Ee]r+)(?:\.{2,}|…)?(?![\p{L}\p{N}_’'\-])/gu,
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
    const sentences = text
      .split(/\n+/u)
      .flatMap((paragraph) =>
        paragraph
          .replace(/(?:\.{2,}|…)/gu, ".")
          .split(/(?<=[.!?])\s+/u),
      )
      .map((sentence) => polishSentence(sentence))
      .filter(Boolean);
    text = flowingParagraphs(sentences);
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

function polishSentence(raw: string) {
  let text = raw.replace(/\s+/g, " ").trim().replace(/^[,.\s]+|[,:\s]+$/gu, "");
  for (let pass = 0; pass < 5 && LEADING.test(text); pass++) {
    const next = text.replace(LEADING, "").trim();
    if (wordCount(next) < 3 || next.length < 12) break;
    text = next;
  }
  text = text
    .replace(/\s+(?:yeah|yes|yep|hmm+)\.?$/iu, "")
    .replace(/[,:]?\s+\b(?:and|but|or|so)\b$/iu, "")
    .trim();
  if (!text || ASIDE.test(text) || /^(?:what|snappy|hey|huh)\b/iu.test(text))
    return "";
  if (!/[\p{L}\p{N}]/u.test(text))
    return /[^\s.!?…,;:'"“”‘’\-]/u.test(text) ? text : "";
  if (/\b(?:big question|good question)\b/iu.test(text) && wordCount(text) <= 6)
    return "";
  const words = wordCount(text);
  const letters = [...text].filter((character) => /\p{L}/u.test(character))
    .length;
  const ended = /[.!?]$/u.test(text);
  const personal = /\b(?:i|i['’]m|we|she|he|it|my|that|you)\b/iu.test(text);
  if (words < 3 && letters < 18 && !personal) return "";
  if (!ended && text.length < 24) return "";
  if (!ended && words >= 4) text = `${text}.`;
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function wordCount(text: string) {
  return text.split(/\s+/u).filter(Boolean).length;
}

function flowingParagraphs(sentences: string[]) {
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (current && next.length > 420) {
      paragraphs.push(current);
      current = sentence;
    } else current = next;
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n\n");
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
