import metrics from "./postcard-font-metrics.json";
import type { Collection } from "./types";

// Metrics are maximum advances at weights 300/400/500/600/700 from the bundled
// Quicksand font, checked against all 229 base advances in the bundled WOFF2.
// Generated from the approved Quicksand TTF with fontTools variable instances.
// The artwork checks the font hash. Widths include a 12% safety margin, and the
// layout reserves extra edges. Unsupported glyphs are held rather than guessed.
export class PostcardLayoutError extends Error {}
function lines(text: string, pixels: number, width: number, spacing = 0) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  const widths = metrics.widths as Record<string, number>;
  const advance = (character: string) => {
    const value = widths[String(character.codePointAt(0))];
    if (value === undefined)
      throw new PostcardLayoutError(
        "Some postcard characters need a print layout check before mailing.",
      );
    return (value / metrics.unitsPerEm) * pixels * 1.12 + spacing;
  };
  const space = advance(" ");
  let count = 1,
    used = 0;
  for (const word of normalized.split(" ")) {
    const glyphs = [...word].map(advance);
    const wordWidth = glyphs.reduce((a, b) => a + b, 0);
    if (used && used + space + wordWidth > width) {
      count++;
      used = 0;
    }
    if (used) used += space;
    for (const glyph of glyphs) {
      if (used && used + glyph > width) {
        count++;
        used = 0;
      }
      used += glyph;
    }
  }
  return count;
}
export const postcardFontSha256 = metrics.fontSha256;
export function assertPostcardTextFits(c: Collection, chapterId: string) {
  const chapter = c.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new PostcardLayoutError("Postcard story not found.");
  const blessing = c.chapterBlessings[chapterId];
  const attribution = [
    blessing?.scriptureReference,
    blessing?.scriptureTranslation,
  ]
    .filter(Boolean)
    .join(" · ");
  const width = 512;
  let frontHeight =
    33.024 + 19.2 + lines(chapter.title, 28, width) * 30.8 + 14.4;
  frontHeight += lines(`From ${c.storyteller.name}`, 12, width, 1) * 15 + 10.56;
  for (const paragraph of [
    chapter.postcardNote,
    blessing?.encouragement,
    blessing?.scriptureText,
  ]) {
    if (paragraph)
      frontHeight += lines(paragraph, 44 / 3, width) * 17.6 + 10.56;
  }
  if (attribution)
    frontHeight += lines(attribution, 40 / 3, width) * 17.6 + 10.56;
  if (frontHeight > 350)
    throw new PostcardLayoutError(
      `The postcard wording for “${chapter.title}” needs a shorter print revision before mailing. The approved story remains saved.`,
    );
  const introLines =
    lines(
      `A story from ${c.storyteller.name}, made for ${c.recipient.name}.`,
      16,
      width,
    ) +
    lines(
      "Scan to read all four stories and watch any included videos.",
      16,
      width,
    );
  if (introLines * 20.8 > 108)
    throw new PostcardLayoutError(
      "The postcard names need a print layout check before mailing.",
    );
  const captionLines =
    lines("Read, watch and send a reply on your story page.", 40 / 3, 195) +
    lines("Keep this card private.", 40 / 3, 195);
  if ((captionLines * 52) / 3 > 84)
    throw new PostcardLayoutError(
      "The postcard reply caption does not fit its print area.",
    );
  if (c.address) {
    const a = c.address;
    const addressLines = [
      a.name,
      a.line1,
      a.line2,
      `${a.city}, ${a.region} ${a.postalCode}`,
      a.country,
    ]
      .filter(Boolean)
      .reduce((total, line) => total + lines(line!.toUpperCase(), 16, 270), 0);
    if (addressLines > 10)
      throw new PostcardLayoutError(
        "The mailing address needs a print layout check before mailing.",
      );
  }
}
