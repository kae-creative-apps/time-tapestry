import type { FilmWord } from "./collection/films/types";

/** Phrase captions follow the spoken clock and disappear during long pauses. */
export function narrationCaptionPages(words: FilmWord[]): FilmWord[][] {
  const pages: FilmWord[][] = [];
  let page: FilmWord[] = [];
  for (const word of words) {
    const previous = page.at(-1);
    const length = [...page, word].map((item) => item.text).join(" ").length;
    if (
      previous &&
      (length > 74 ||
        word.startMs - previous.endMs > 900 ||
        (page.length >= 5 && /[.!?]$/.test(previous.text)))
    ) {
      pages.push(page);
      page = [];
    }
    page.push(word);
  }
  if (page.length) pages.push(page);
  return pages;
}

export function narrationCaptionAt(
  pages: FilmWord[][],
  timeMs: number,
): string {
  const page = pages.find(
    (words) =>
      words.length &&
      timeMs >= words[0].startMs &&
      timeMs < words[words.length - 1].endMs,
  );
  return page?.map((word) => word.text).join(" ") ?? "";
}
