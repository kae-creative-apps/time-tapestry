import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PageSizes,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Collection } from "./types";
import { BRAND_COLORS } from "../brand-art";

export class StoryBookError extends Error {}

/** An allowlisted snapshot, never the full collection or its private metadata. */
export type StoryBook = {
  storytellerName: string;
  recipientName: string;
  draft?: boolean;
  chapters: Array<{
    id: string;
    title: string;
    content: string;
    encouragement?: string;
    scripture?: string;
  }>;
};

export function storyBookSnapshot(
  c: Collection,
  recipientName: string,
  options: { draft?: boolean } = {},
): StoryBook {
  const chapters = ["q1", "q2", "q3", "q4"].map((id) => {
    const chapter = c.chapters.find((item) => item.id === id);
    if (!chapter?.title.trim() || !chapter.content.trim())
      throw new StoryBookError(
        "All four approved stories are needed before the book can be downloaded.",
      );
    const blessing = c.chapterBlessings[id];
    return {
      id,
      title: chapter.title,
      content: chapter.content,
      ...(blessing?.encouragement
        ? { encouragement: blessing.encouragement }
        : {}),
      ...(blessing?.scriptureText || blessing?.scriptureReference
        ? {
            scripture: [
              blessing.scriptureText,
              [blessing.scriptureReference, blessing.scriptureTranslation]
                .filter(Boolean)
                .join(" "),
            ]
              .filter(Boolean)
              .join("\n"),
          }
        : {}),
    };
  });
  if (c.status !== "approved" && !options.draft)
    throw new StoryBookError(
      "Your story book will be ready after the collection is approved.",
    );
  return {
    storytellerName: c.storyteller.name,
    recipientName,
    chapters,
    ...(options.draft ? { draft: true } : {}),
  };
}

const printable = (text: string) =>
  text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");

/** Keep every word, including words too long to fit on a single line. */
export function wrapBookText(
  text: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(text).split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= width) {
        line = next;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      // Split by code point, never through a UTF-16 surrogate pair.
      for (const character of word) {
        if (line && measure(line + character) > width) {
          lines.push(line);
          line = "";
        }
        if (measure(character) > width)
          throw new StoryBookError(
            "A character cannot fit in the story book. Please contact the Time Tapestry team.",
          );
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function assertGlyphs(font: PDFFont, values: string[]) {
  const supported = new Set(font.getCharacterSet());
  for (const text of values)
    for (const character of printable(text)) {
      if (character === "\n" || supported.has(character.codePointAt(0)!))
        continue;
      const point = character.codePointAt(0)!.toString(16).toUpperCase();
      throw new StoryBookError(
        `The book font cannot display character U+${point} yet. Your stories are unchanged. Please contact the Time Tapestry team for help downloading the complete book.`,
      );
    }
}

const color = (hex: string) =>
  rgb(
    ...([1, 3, 5].map(
      (start) => parseInt(hex.slice(start, start + 2), 16) / 255,
    ) as [number, number, number]),
  );
const ink = color(BRAND_COLORS.espresso);
const paper = color(BRAND_COLORS.paper);
const sage = color(BRAND_COLORS.sage);
const [width, height] = PageSizes.Letter;
const margin = 54;
const textWidth = width - margin * 2;

/** Produces bytes only. Nothing is stored publicly or sent to another service. */
export async function renderStoryBook(book: StoryBook): Promise<Uint8Array> {
  const [fontBytes, logoBytes] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "public/brand/fonts/quicksand-print-medium-v1.ttf",
      ),
    ),
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-lockup.png")),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const values = [
    book.storytellerName,
    book.recipientName,
    ...book.chapters.flatMap((chapter) => [
      chapter.title,
      chapter.content,
      chapter.encouragement || "",
      chapter.scripture || "",
    ]),
  ];
  let fallback: PDFFont | undefined;
  const primarySet = new Set(font.getCharacterSet());
  if (
    values.some((text) =>
      [...printable(text)].some(
        (ch) => ch !== "\n" && !primarySet.has(ch.codePointAt(0)!),
      ),
    )
  ) {
    fallback = await doc.embedFont(
      await readFile(
        path.join(
          process.cwd(),
          "public/brand/fonts/NotoSansCJKsc-Regular.otf",
        ),
      ),
      { subset: true },
    );
  }
  const fallbackSet = new Set(fallback?.getCharacterSet() || []);
  const selectFont = (ch: string) => {
    if (primarySet.has(ch.codePointAt(0)!)) return font;
    if (fallback && fallbackSet.has(ch.codePointAt(0)!)) return fallback;
    assertGlyphs(font, [ch]);
    return font;
  };
  const runs = (text: string) => {
    const result: Array<{ text: string; font: PDFFont }> = [];
    for (const ch of printable(text)) {
      const selected = selectFont(ch);
      const last = result.at(-1);
      if (last?.font === selected) last.text += ch;
      else result.push({ text: ch, font: selected });
    }
    return result;
  };
  const measure = (text: string, size: number) =>
    runs(text).reduce(
      (total, run) => total + run.font.widthOfTextAtSize(run.text, size),
      0,
    );
  const draw = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    size: number,
  ) => {
    for (const run of runs(text)) {
      page.drawText(run.text, { x, y, size, font: run.font, color: ink });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  };
  for (const value of values)
    for (const ch of printable(value)) if (ch !== "\n") selectFont(ch);
  const logo = await doc.embedPng(logoBytes);
  // Metadata deliberately excludes email addresses, member lists, IDs and links.
  doc.setTitle("Time Tapestry | Stories woven together");
  doc.setAuthor("Time Tapestry");
  doc.setCreator("Time Tapestry");
  doc.setProducer("Time Tapestry");
  doc.setSubject(
    book.draft
      ? "Private draft for storyteller review"
      : "A personal collection of four approved stories",
  );
  doc.setLanguage("en-US");

  const cover = doc.addPage(PageSizes.Letter);
  cover.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  cover.drawRectangle({
    x: margin,
    y: height - 176,
    width: textWidth,
    height: 2,
    color: sage,
  });
  const logoSize = logo.scaleToFit(190, 72);
  cover.drawImage(logo, {
    x: margin,
    y: height - margin - logoSize.height,
    ...logoSize,
  });
  let coverY = height - 232;
  const coverBlock = (text: string, size: number, lineHeight: number) => {
    for (const line of wrapBookText(text, textWidth, (value) =>
      measure(value, size),
    )) {
      draw(cover, line, margin, coverY, size);
      coverY -= lineHeight;
    }
  };
  coverBlock("Stories woven together.", 28, 37);
  if (book.draft) coverBlock("Private draft for your review", 13, 20);
  coverY -= 30;
  // Long names flow without shrinking the book's reading text.
  coverBlock(`From ${book.storytellerName}`, 21, 29);
  coverY -= 12;
  coverBlock(`For ${book.recipientName}`, 21, 29);
  if (coverY < 115)
    throw new StoryBookError(
      "The names are too long for the book cover. Please ask the Time Tapestry team to help format the complete names.",
    );
  cover.drawText("Four stories to keep and return to.", {
    x: margin,
    y: 92,
    font,
    size: 14,
    color: ink,
  });

  for (const [index, chapter] of book.chapters.entries()) {
    let page = doc.addPage(PageSizes.Letter);
    let y = height - 66;
    const runningHeader = () => {
      page.drawText(`TIME TAPESTRY  /  STORY ${index + 1}`, {
        x: margin,
        y: height - 38,
        font,
        size: 9,
        color: ink,
      });
      page.drawLine({
        start: { x: margin, y: height - 48 },
        end: { x: width - margin, y: height - 48 },
        thickness: 0.6,
        color: sage,
      });
    };
    runningHeader();
    const block = (text: string, size = 14, leading = 23) => {
      for (const line of wrapBookText(text, textWidth, (value) =>
        measure(value, size),
      )) {
        if (y - leading < 63) {
          page = doc.addPage(PageSizes.Letter);
          y = height - 78;
          runningHeader();
        }
        y -= leading;
        if (line) draw(page, line, margin, y, size);
      }
    };
    block(chapter.title, 27, 35);
    y -= 20;
    block(chapter.content);
    if (chapter.encouragement || chapter.scripture) {
      y -= 20;
      block("A word for you", 18, 29);
      y -= 7;
      if (chapter.encouragement) block(chapter.encouragement);
      if (chapter.scripture) {
        y -= 12;
        block(chapter.scripture);
      }
    }
  }
  const pages = doc.getPages();
  for (const [index, page] of pages.entries()) {
    if (!index) continue;
    const number = `${index} / ${pages.length - 1}`;
    page.drawText(number, {
      x: width - margin - font.widthOfTextAtSize(number, 10),
      y: 35,
      font,
      size: 10,
      color: ink,
    });
  }
  return doc.save();
}
