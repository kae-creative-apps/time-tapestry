import { BRAND_COLORS } from "../brand-art";

export const POSTCARD_DESIGN_VERSION = "designer-four-themes-4x6-v7";
export const POSTCARD_THEMES = [
  "kindness",
  "faith",
  "generosity",
  "encouragement",
] as const;
export type PostcardTheme = (typeof POSTCARD_THEMES)[number];

export function postcardThemeForChapter(chapterId: string): PostcardTheme {
  const index = ["q1", "q2", "q3", "q4"].indexOf(chapterId);
  if (index < 0) throw new Error("Choose one of the four postcard chapters.");
  return POSTCARD_THEMES[index];
}

/** 6 x 4 inches at trim, with 1/8 inch bleed on every edge. */
export const POSTCARD_LAYOUT = {
  width: 600,
  height: 408,
  bleed: 12,
  dedication: { x: 73.5, y: 44, width: 232, bottom: 74 },
  number: { x: 46.5, y: 44, width: 20 },
  backSignature: { x: 40, y: 345, width: 104, height: 31 },
  note: { x: 40, y: 25, width: 520, bottom: 152 },
  sender: { x: 40, y: 158, width: 208, bottom: 180 },
  qr: { x: 40, y: 184, width: 96, height: 96 },
  caption: { x: 144, y: 184, width: 108, bottom: 332 },
  // Official Lob 4x6 template, PDF points converted to 96dpi CSS pixels.
  // The provider stamps its own addresses, postage and barcode here.
  postal: { x: 258.39, y: 156.03, width: 315.21, height: 228 },
} as const;

// Shared with preflight so measured copy and print CSS cannot drift apart.
export const POSTCARD_TYPE = {
  dedication: { size: 9.77, lineHeight: 14 },
  salutation: { size: 13.33, lineHeight: 17, gap: 5 },
  sender: { size: 13.33, lineHeight: 17, gap: 5 },
  instruction: { size: 13.33, lineHeight: 17, gap: 8 },
  caption: { size: 12, lineHeight: 16 },
} as const;

/** Never receives a collection, transcript, private chapter text or blessing. */
export type PublicPostcardContent = {
  recipientFirstName: string;
  storytellerFirstName: string;
  publicMessage: string;
  theme?: PostcardTheme;
};
export type PostcardDesignAssets = {
  signaturePng: string;
  approvedFrontPngs: Record<PostcardTheme, string>;
  qrPng: string;
  quicksandPrintTtf: string;
};
export const POSTCARD_BACK_CAPTION =
  "Sign in with the email address linked to this gift.";
export const POSTCARD_BACK_INSTRUCTION = "Scan to open your story and reply.";

export function postcardFirstName(name: string, fallback: string) {
  return name.trim().split(/\s+/)[0] || fallback;
}

export function postcardMessageTypography(message: string) {
  const size = message.length <= 90 ? 24 : message.length <= 160 ? 18 : 16;
  return { size, lineHeight: size * 1.25 };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"'{}]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "{": "&#123;",
        "}": "&#125;",
      })[character]!,
  );
}
function assertDataAsset(value: string, mime: string) {
  if (
    typeof value !== "string" ||
    !value.startsWith(`data:${mime};base64,`) ||
    !/^[A-Za-z0-9+/=]+$/.test(value.slice(value.indexOf(",") + 1))
  )
    throw new Error("Postcard artwork requires embedded print assets.");
}

export function renderPostcardDesign(
  content: PublicPostcardContent,
  assets: PostcardDesignAssets,
) {
  const theme = content.theme || "kindness";
  if (!POSTCARD_THEMES.includes(theme))
    throw new Error("Choose one of the four postcard designs.");
  const frontPng = assets.approvedFrontPngs[theme];
  for (const asset of [assets.signaturePng, frontPng, assets.qrPng])
    assertDataAsset(asset, "image/png");
  assertDataAsset(assets.quicksandPrintTtf, "font/ttf");
  const type = postcardMessageTypography(content.publicMessage);
  const layout = POSTCARD_LAYOUT;
  const text = POSTCARD_TYPE;
  const number = String(POSTCARD_THEMES.indexOf(theme) + 1).padStart(2, "0");
  const typography = `@font-face{font-family:Quicksand;src:url(${assets.quicksandPrintTtf}) format('truetype');font-weight:500;font-style:normal;font-display:block}`;
  const base = `${typography}*{box-sizing:border-box}html,body{width:${layout.width / 96}in;height:${layout.height / 96}in;margin:0;overflow:hidden}body{position:relative;color:${BRAND_COLORS.espresso};font-family:Quicksand,Arial,sans-serif;font-weight:500}p{margin:0;overflow-wrap:break-word;word-wrap:break-word}img{display:block}.signature{position:absolute;object-fit:contain;object-position:left center}`;
  const document = (css: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'"><style>${base}${css}</style></head><body data-postcard-size="4x6" data-postcard-design="${POSTCARD_DESIGN_VERSION}" data-postcard-theme="${theme}">${body}</body></html>`;
  const front = document(
    `.approved-front{position:absolute;inset:0;width:${layout.width}px;height:${layout.height}px}.dedication,.number{position:absolute;top:${layout.dedication.y}px;font-size:${text.dedication.size}px;line-height:${text.dedication.lineHeight}px;color:#756454}.dedication{left:${layout.dedication.x}px;width:${layout.dedication.width}px}.number{left:${layout.number.x}px;width:${layout.number.width}px}`,
    `<img class="approved-front" alt="Time Tapestry ${theme} postcard" src="${frontPng}"><p class="number">${number}</p><p class="dedication" data-print-bottom="${layout.dedication.bottom}">From ${escapeHtml(content.storytellerFirstName)}, for ${escapeHtml(content.recipientFirstName)}.</p>`,
  );
  const back = document(
    `body{background:white}.content{position:absolute;left:${layout.note.x}px;top:${layout.note.y}px;width:${layout.note.width}px}.salutation{font-size:${text.salutation.size}px;line-height:${text.salutation.lineHeight}px;margin-bottom:${text.salutation.gap}px}.message{font-size:${type.size}px;line-height:${type.lineHeight}px;white-space:pre-line}.sender{position:absolute;left:${layout.sender.x}px;top:${layout.sender.y}px;width:${layout.sender.width}px;font-size:${text.sender.size}px;line-height:${text.sender.lineHeight}px}.qr{position:absolute;left:${layout.qr.x}px;top:${layout.qr.y}px;width:${layout.qr.width}px;height:${layout.qr.height}px}.caption{position:absolute;left:${layout.caption.x}px;top:${layout.caption.y}px;width:${layout.caption.width}px}.instruction{font-size:${text.instruction.size}px;line-height:${text.instruction.lineHeight}px;margin-bottom:${text.instruction.gap}px}.sign-in{font-size:${text.caption.size}px;line-height:${text.caption.lineHeight}px}.signature{left:${layout.backSignature.x}px;top:${layout.backSignature.y}px;width:${layout.backSignature.width}px;height:${layout.backSignature.height}px}.ink-free{position:absolute;left:${layout.postal.x}px;top:${layout.postal.y}px;width:${layout.postal.width}px;height:${layout.postal.height}px;background:white}`,
    `<div class="content" data-print-bottom="${layout.note.bottom}"><p class="salutation">Dear ${escapeHtml(content.recipientFirstName)},</p><p class="message">${escapeHtml(content.publicMessage)}</p></div><p class="sender" data-print-bottom="${layout.sender.bottom}">From ${escapeHtml(content.storytellerFirstName)}</p><img class="qr" alt="Scan to open your private story page" src="${assets.qrPng}"><div class="caption" data-print-bottom="${layout.caption.bottom}"><p class="instruction">${POSTCARD_BACK_INSTRUCTION}</p><p class="sign-in">${POSTCARD_BACK_CAPTION}</p></div><img class="signature" alt="Time Tapestry" src="${assets.signaturePng}"><div class="ink-free" aria-hidden="true"></div>`,
  );
  return { front, back };
}
