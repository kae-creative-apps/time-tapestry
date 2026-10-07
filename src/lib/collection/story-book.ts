import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import {
  PDFDocument,
  PageSizes,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Collection } from "./types";
import { selectedAnswers } from "./content";
import { recipientChapterUrl } from "./postcard-artwork";
import { publicPostcardMessage } from "./postcard-public-message";
import { cleanStoryBookText } from "./story-book-reading";
import { getChapterQuestion, type ChapterId } from "../interview-state";
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
    quote?: string;
    question?: string;
    label?: string;
    /** Public chapter address. It does not include a sign-in key. */
    pageUrl?: string;
    /** Optional film frame. The book still renders when this is absent. */
    still?: Uint8Array;
    encouragement?: string;
    scripture?: string;
  }>;
};

const THEME_LABELS: Record<string, string> = {
  q1: "Kindness",
  q2: "Faith",
  q3: "Generosity",
  q4: "Encouragement",
};

function openingQuestion(
  c: Collection,
  chapterId: string,
  title: string,
  recipientName: string,
) {
  const asked = (c.interviews ?? [])
    .flatMap((session) => session.turns)
    .filter((turn) => turn.role === "agent" && turn.chapterId === chapterId)
    .sort((a, b) => a.sequence - b.sequence)
    .map((turn) => turn.text.replace(/\s+/g, " ").trim())
    .find((text) => text.replace(/[.…]/g, "").trim().length > 12);
  if (asked) return asked;
  const saved = selectedAnswers(c, chapterId)
    .map((answer) => answer.prompt.replace(/\s+/g, " ").trim())
    .find(
      (prompt) =>
        prompt &&
        prompt !== "Your conversation" &&
        prompt.toLocaleLowerCase() !== title.trim().toLocaleLowerCase(),
    );
  if (saved) return saved;
  if (
    chapterId === "q1" ||
    chapterId === "q2" ||
    chapterId === "q3" ||
    chapterId === "q4"
  )
    return getChapterQuestion(chapterId, {
      recipientName,
      faithFraming: c.faithFraming,
    });
  return undefined;
}

function chapterPageUrl(c: Collection, chapterId: string) {
  if (!/^q[1-4]$/.test(chapterId)) return undefined;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !origin.startsWith("https://")) return undefined;
  try {
    return recipientChapterUrl(c, chapterId, origin);
  } catch {
    return undefined;
  }
}

/** Pull only a complete sentence actually spoken by the storyteller. */
export function storyQuoteFromTranscript(text: string): string | undefined {
  const sentences = text.match(/[^.!?\n]+[.!?]+(?:[”"’])?/gu) || [];
  return sentences
    .map((sentence) => sentence.trim())
    .find((sentence) => {
      const count = sentence.split(/\s+/u).length;
      return (
        count >= 8 &&
        count <= 40 &&
        sentence.length <= 260 &&
        !sentence.endsWith("?")
      );
    });
}

export function storyBookSnapshot(
  c: Collection,
  recipientName: string,
  options: { draft?: boolean; originalOnly?: boolean; through?: string } = {},
): StoryBook {
  const chapters: StoryBook["chapters"] = ["q1", "q2", "q3", "q4"].map((id) => {
    const chapter = c.chapters.find((item) => item.id === id);
    if (!chapter?.title.trim() || !chapter.content.trim())
      throw new StoryBookError(
        "All four approved stories are needed before the book can be downloaded.",
      );
    const blessing = c.chapterBlessings[id];
    const content = cleanStoryBookText(
      chapter.content,
      chapter.generatedWith === "gloo",
    );
    const extracted = storyQuoteFromTranscript(content);
    const postcard =
      id in THEME_LABELS ? publicPostcardMessage(c, id) : undefined;
    const quote =
      extracted && extracted.length < content.length * 0.72
        ? extracted
        : postcard;
    const question = openingQuestion(c, id, chapter.title, recipientName);
    const pageUrl = chapterPageUrl(c, id);
    return {
      id,
      title: chapter.title,
      content,
      ...(THEME_LABELS[id] ? { label: THEME_LABELS[id] } : {}),
      ...(question ? { question } : {}),
      ...(pageUrl ? { pageUrl } : {}),
      ...(quote ? { quote } : {}),
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
  if (
    options.through &&
    (!Number.isFinite(Date.parse(options.through)) ||
      new Date(options.through).toISOString() !== options.through)
  )
    throw new StoryBookError(
      "This book edition is unavailable. Choose a saved edition from your library.",
    );
  if (c.status === "approved" && !options.originalOnly && !options.draft) {
    const moments = (c.livingStory?.moments || [])
      .filter(
        (moment) =>
          moment.status === "published" &&
          moment.publishedAt &&
          moment.videoMediaId &&
          moment.content?.trim() &&
          (!options.through || moment.publishedAt <= options.through),
      )
      .sort(
        (a, b) =>
          a.publishedAt!.localeCompare(b.publishedAt!) ||
          a.id.localeCompare(b.id),
      );
    for (const moment of moments)
      chapters.push({
        id: moment.id,
        title: moment.title,
        content: cleanStoryBookText(moment.content!, true),
        question: moment.question,
        ...(moment.sourceQuote ? { quote: moment.sourceQuote } : {}),
      });
  }
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
const clay = color(BRAND_COLORS.clay);
const taupe = color(BRAND_COLORS.taupe);
const chocolate = color("#3c2a22");
const [width, height] = PageSizes.Letter;
const margin = 40;
const textWidth = width - margin * 2;
const bodySize = 10.5;
const bodyLeading = 14.2;

async function embedStill(doc: PDFDocument, bytes: Uint8Array) {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  return png ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

/** Produces bytes only. Nothing is stored publicly or sent to another service. */
export async function renderStoryBook(book: StoryBook): Promise<Uint8Array> {
  const [fontBytes, logoBytes] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "public/brand/fonts/quicksand-print-medium-v1.ttf",
      ),
    ),
    readFile(
      path.join(process.cwd(), "public/brand/time-tapestry-lockup-light.png"),
    ),
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
      chapter.quote || "",
      chapter.question || "",
      chapter.label || "",
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
    fill = ink,
  ) => {
    for (const run of runs(text)) {
      page.drawText(run.text, { x, y, size, font: run.font, color: fill });
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  };
  const drawOrb = (page: PDFPage, x: number, y: number, scale = 1) => {
    page.drawCircle({
      x,
      y,
      size: 22 * scale,
      color: clay,
      opacity: 0.92,
    });
    page.drawCircle({
      x: x + 11 * scale,
      y: y + 8 * scale,
      size: 14 * scale,
      color: sage,
      opacity: 0.8,
    });
    page.drawCircle({
      x: x - 8 * scale,
      y: y - 7 * scale,
      size: 9 * scale,
      color: paper,
      opacity: 0.55,
    });
  };
  for (const value of values)
    for (const ch of printable(value)) if (ch !== "\n") selectFont(ch);
  const logoLight = await doc.embedPng(logoBytes);
  // Metadata deliberately excludes email addresses, member lists, IDs and links.
  doc.setTitle("Time Tapestry | Stories woven together");
  doc.setAuthor("Time Tapestry");
  doc.setCreator("Time Tapestry");
  doc.setProducer("Time Tapestry");
  doc.setSubject(
    book.draft
      ? "Private draft for storyteller review"
      : "A personal collection of stories in the storyteller’s own words",
  );
  doc.setLanguage("en-US");

  const cover = doc.addPage(PageSizes.Letter);
  cover.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  cover.drawRectangle({
    x: 0,
    y: height - 188,
    width,
    height: 188,
    color: chocolate,
  });
  drawOrb(cover, width - 78, height - 96, 1.35);
  const logoSize = logoLight.scaleToFit(168, 58);
  cover.drawImage(logoLight, {
    x: margin,
    y: height - 36 - logoSize.height,
    ...logoSize,
  });
  let coverY = height - 230;
  const coverBlock = (
    text: string,
    size: number,
    lineHeight: number,
    fill = ink,
  ) => {
    for (const line of wrapBookText(text, textWidth, (value) =>
      measure(value, size),
    )) {
      draw(cover, line, margin, coverY, size, fill);
      coverY -= lineHeight;
    }
  };
  coverBlock("Stories woven together.", 26, 32);
  if (book.draft) coverBlock("Private draft for your review", 11, 16, taupe);
  coverY -= 16;
  // Long names flow without shrinking the book's reading text.
  coverBlock(`From ${book.storytellerName}`, 18, 24);
  coverY -= 4;
  coverBlock(`For ${book.recipientName}`, 18, 24);
  if (coverY < 120)
    throw new StoryBookError(
      "The names are too long for the book cover. Please ask the Time Tapestry team to help format the complete names.",
    );
  cover.drawRectangle({ x: 0, y: 0, width, height: 78, color: chocolate });
  drawOrb(cover, 78, 40, 0.7);
  cover.drawText("Stories to keep and return to.", {
    x: margin + 56,
    y: 32,
    font,
    size: 12,
    color: paper,
  });

  // Reserve contents pages before chapter layout, then fill in actual page numbers.
  const contents: Array<{
    page: PDFPage;
    y: number;
    lines: string[];
    chapterIndex: number;
  }> = [];
  let contentsPage: PDFPage;
  let contentsY = 0;
  const addContentsPage = () => {
    contentsPage = doc.addPage(PageSizes.Letter);
    contentsPage.drawRectangle({ x: 0, y: 0, width, height, color: paper });
    draw(contentsPage, "The stories inside", margin, height - 58, 18);
    draw(
      contentsPage,
      "A life, remembered in their own words.",
      margin,
      height - 78,
      10.5,
    );
    contentsY = height - 108;
  };
  addContentsPage();
  book.chapters.forEach((chapter, chapterIndex) => {
    const lines = wrapBookText(
      chapter.label ? `${chapter.label}  ·  ${chapter.title}` : chapter.title,
      textWidth - 68,
      (value) => measure(value, 11),
    );
    const entryHeight = lines.length * 16 + 10;
    if (contentsY - entryHeight < 75) addContentsPage();
    contents.push({ page: contentsPage, y: contentsY, lines, chapterIndex });
    contentsY -= entryHeight;
  });
  const chapterPages: number[] = [];

  const postcardDir = path.join(
    process.cwd(),
    "public/brand/postcards/designer-2026-10-06-v2",
  );
  const postcardFiles: Record<string, string> = {
    q1: "postcard-01-kindness-print-background.png",
    q2: "postcard-02-faith-print-background.png",
    q3: "postcard-03-generosity-print-background.png",
    q4: "postcard-04-encouragement-print-background.png",
  };
  const postcardImages = new Map<
    string,
    Awaited<ReturnType<PDFDocument["embedPng"]>>
  >();
  const postcardFor = async (id: string) => {
    const file = postcardFiles[id];
    if (!file) return undefined;
    const cached = postcardImages.get(id);
    if (cached) return cached;
    const image = await doc.embedPng(
      await readFile(path.join(postcardDir, file)),
    );
    postcardImages.set(id, image);
    return image;
  };

  let page: PDFPage | undefined;
  let y = 0;
  let running = "";
  const openSheet = (header = "") => {
    page = doc.addPage(PageSizes.Letter);
    page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
    if (header) {
      draw(page, header, margin, height - 26, 8, taupe);
      page.drawLine({
        start: { x: margin, y: height - 32 },
        end: { x: width - margin, y: height - 32 },
        thickness: 0.4,
        color: sage,
      });
      y = height - 44;
    } else y = height - 36;
  };
  const need = (space: number, continued = false) => {
    const room = Math.min(space, height - 90);
    if (!page || y - room < 40) {
      if (page && y > height - 80) return page;
      openSheet(continued && page ? running : "");
    }
    return page!;
  };

  for (const [index, chapter] of book.chapters.entries()) {
    running = chapter.label || `Story ${index + 1}`;
    const titleLines = wrapBookText(chapter.title, textWidth - 110, (value) =>
      measure(value, 15),
    );
    const bar = 16 + titleLines.length * 17;
    const rowH = 124;
    const questionHeight = chapter.question
      ? wrapBookText(chapter.question, textWidth, (value) => measure(value, 11))
          .length *
          14.5 +
        10
      : 0;
    const quoteHeight =
      chapter.quote && chapter.still?.byteLength
        ? wrapBookText(`“${chapter.quote}”`, textWidth - 18, (value) =>
            measure(value, 11.5),
          ).length *
            15 +
          40
        : 0;
    const bodyPreview =
      Math.min(
        4,
        wrapBookText(chapter.content, textWidth, (value) =>
          measure(value, bodySize),
        ).length,
      ) * bodyLeading;
    need(bar + rowH + questionHeight + quoteHeight + bodyPreview + 28);
    chapterPages.push(doc.getPages().indexOf(page!));
    let host = page!;
    host.drawRectangle({
      x: margin,
      y: y - bar,
      width: textWidth,
      height: bar,
      color: chocolate,
    });
    if (chapter.label)
      draw(host, chapter.label, margin + 12, y - 13, 8, paper);
    titleLines.forEach((line, lineIndex) =>
      draw(host, line, margin + 12, y - 30 - lineIndex * 17, 15, paper),
    );
    y -= bar + 8;

    const still = chapter.still?.byteLength
      ? await embedStill(doc, chapter.still)
      : undefined;
    const art = await postcardFor(chapter.id);
    const artW = still ? 220 : 248;
    host = need(rowH);
    if (art) {
      const fitted = art.scaleToFit(artW, rowH);
      host.drawImage(art, {
        x: margin,
        y: y - rowH + (rowH - fitted.height) / 2,
        ...fitted,
      });
    } else drawOrb(host, margin + 40, y - rowH / 2, 1.15);
    const sideX = margin + artW + 12;
    const sideW = textWidth - artW - 12;
    let quotePlaced = false;
    if (still) {
      const fitted = still.scaleToFit(sideW, rowH);
      host.drawImage(still, {
        x: width - margin - fitted.width,
        y: y - rowH + (rowH - fitted.height) / 2,
        ...fitted,
      });
    } else if (chapter.quote) {
      const quoteLines = wrapBookText(
        `“${chapter.quote}”`,
        sideW - 8,
        (value) => measure(value, 11),
      ).slice(0, 7);
      let quoteY = y - 18;
      for (const line of quoteLines) {
        draw(host, line, sideX, quoteY, 11);
        quoteY -= 14;
      }
      draw(
        host,
        `In ${book.storytellerName}’s own words`,
        sideX,
        quoteY - 2,
        8,
        taupe,
      );
      quotePlaced = true;
    }
    y -= rowH + 10;

    const block = (
      text: string,
      size = bodySize,
      leading = bodyLeading,
      fill = ink,
      inset = 0,
    ) => {
      for (const line of wrapBookText(text, textWidth - inset, (value) =>
        measure(value, size),
      )) {
        host = need(leading, true);
        y -= leading;
        if (line) draw(host, line, margin + inset, y, size, fill);
      }
    };
    if (chapter.question) {
      y -= 2;
      block(chapter.question, 11, 14.5, taupe);
      y -= 4;
    }
    if (chapter.quote && !quotePlaced) {
      const quoteLines = wrapBookText(
        `“${chapter.quote}”`,
        textWidth - 18,
        (value) => measure(value, 11.5),
      );
      const boxHeight = quoteLines.length * 15 + 22;
      host = need(boxHeight + 8, true);
      y -= 8;
      host.drawRectangle({
        x: margin,
        y: y - boxHeight + 8,
        width: textWidth,
        height: boxHeight,
        color: color("#f3ebe4"),
      });
      host.drawRectangle({
        x: margin,
        y: y - boxHeight + 8,
        width: 3,
        height: boxHeight,
        color: clay,
      });
      for (const line of quoteLines) {
        y -= 15;
        draw(host, line, margin + 12, y, 11.5);
      }
      y -= 14;
      draw(
        host,
        `In ${book.storytellerName}’s own words`,
        margin + 12,
        y,
        8,
        taupe,
      );
      y -= 6;
    }
    y -= 2;
    block(chapter.content);
    if (chapter.encouragement || chapter.scripture) {
      y -= 8;
      block("A word for you", 11, 15);
      y -= 2;
      if (chapter.encouragement) block(chapter.encouragement);
      if (chapter.scripture) {
        y -= 4;
        block(chapter.scripture, 10.5, 14, taupe);
      }
    }
    if (chapter.pageUrl) {
      const qr = await doc.embedPng(
        await QRCode.toBuffer(chapter.pageUrl, {
          errorCorrectionLevel: "M",
          margin: 0,
          width: 180,
          color: { dark: BRAND_COLORS.espresso, light: "#fbfaf8" },
        }),
      );
      host = need(64, true);
      y -= 12;
      const qrSize = qr.scale(0.26);
      host.drawImage(qr, { x: margin, y: y - qrSize.height, ...qrSize });
      draw(
        host,
        "Open this chapter",
        margin + qrSize.width + 10,
        y - 16,
        9,
        taupe,
      );
      y -= qrSize.height;
    }
    y -= 16;
    if (y > 52) {
      host = page!;
      host.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.4,
        color: sage,
      });
      y -= 12;
    }
  }
  for (const entry of contents) {
    draw(
      entry.page,
      String(entry.chapterIndex + 1).padStart(2, "0"),
      margin,
      entry.y,
      11,
    );
    entry.lines.forEach((line, i) =>
      draw(entry.page, line, margin + 28, entry.y - i * 16, 11),
    );
    const pageNumber = String(chapterPages[entry.chapterIndex]);
    draw(
      entry.page,
      pageNumber,
      width - margin - measure(pageNumber, 12),
      entry.y,
      12,
    );
  }
  const pages = doc.getPages();
  for (const [index, page] of pages.entries()) {
    if (!index) continue;
    const number = `${index} / ${pages.length - 1}`;
    page.drawText(number, {
      x: width - margin - font.widthOfTextAtSize(number, 10),
      y: 22,
      font,
      size: 10,
      color: ink,
    });
  }
  return doc.save();
}
