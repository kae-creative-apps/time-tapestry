import metrics from "./postcard-font-metrics.json";
import type { Collection } from "./types";
import {
  publicPostcardMessage,
  PUBLIC_POSTCARD_MESSAGE_LIMIT,
} from "./postcard-public-message";
import {
  POSTCARD_LAYOUT,
  POSTCARD_BACK_CAPTION,
  POSTCARD_BACK_INSTRUCTION,
  postcardFirstName,
  postcardMessageTypography,
  type PublicPostcardContent,
} from "./postcard-design";

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
export function postcardPrintContent(
  c: Collection,
  chapterId: string,
): PublicPostcardContent {
  return {
    recipientFirstName: postcardFirstName(c.recipient.name, "friend"),
    storytellerFirstName: postcardFirstName(
      c.storyteller.name,
      "your loved one",
    ),
    publicMessage: publicPostcardMessage(c, chapterId),
  };
}

export function assertPublicPostcardFits(content: PublicPostcardContent) {
  const layout = POSTCARD_LAYOUT;
  if (
    !content.publicMessage.trim() ||
    content.publicMessage.length > PUBLIC_POSTCARD_MESSAGE_LIMIT
  )
    throw new PostcardLayoutError(
      `Public postcard encouragement needs 1 to ${PUBLIC_POSTCARD_MESSAGE_LIMIT} characters before printing.`,
    );
  const type = postcardMessageTypography(content.publicMessage);
  // The shared renderer preserves explicit line breaks. Count those here too.
  const messageLines = content.publicMessage
    .split(/\r?\n/)
    .reduce(
      (total, line) =>
        total + Math.max(1, lines(line, type.size, layout.front.width - 12)),
      0,
    );
  const frontHeight =
    lines(`Dear ${content.recipientFirstName},`, 18, layout.front.width - 12) *
      24 +
    18 +
    messageLines * type.lineHeight +
    20 +
    lines(`From ${content.storytellerFirstName}`, 16, layout.front.width - 12) *
      22;
  if (frontHeight > layout.front.bottom - layout.front.y)
    throw new PostcardLayoutError(
      "The public postcard message needs a shorter print revision before mailing. Your private story remains saved.",
    );
  const introHeight =
    lines(
      `A story from ${content.storytellerFirstName}`,
      20,
      layout.backIntro.width - 12,
    ) *
      26 +
    8 +
    lines(POSTCARD_BACK_INSTRUCTION, 14, layout.backIntro.width - 12) * 20;
  if (introHeight > layout.backIntro.bottom - layout.backIntro.y)
    throw new PostcardLayoutError(
      "The postcard names need a print layout check before mailing.",
    );
  const captionHeight =
    lines(POSTCARD_BACK_CAPTION, 13, layout.caption.width - 8) * 17;
  if (captionHeight > layout.caption.bottom - layout.caption.y)
    throw new PostcardLayoutError(
      "The postcard sign-in caption does not fit its print area.",
    );
}

export function assertPostcardTextFits(c: Collection, chapterId: string) {
  if (!c.chapters.some((chapter) => chapter.id === chapterId))
    throw new PostcardLayoutError("Postcard story not found.");
  const explicitMessage = c.postcardPublicMessages?.[chapterId];
  if (
    explicitMessage &&
    explicitMessage.trim().length > PUBLIC_POSTCARD_MESSAGE_LIMIT
  )
    throw new PostcardLayoutError(
      `Public postcard copy exceeds ${PUBLIC_POSTCARD_MESSAGE_LIMIT} characters. Create a shorter print revision before mailing.`,
    );
  assertPublicPostcardFits(postcardPrintContent(c, chapterId));
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
