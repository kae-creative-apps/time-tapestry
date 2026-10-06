import { BRAND_COLORS } from "../brand-art";

export const POSTCARD_DESIGN_VERSION = "quiet-flowing-keepsake-v6";

/** 6 x 9 inches at trim, with 1/8 inch bleed on each edge. */
export const POSTCARD_LAYOUT = {
  width: 888,
  height: 600,
  bleed: 12,
  signature: { x: 263, y: 196, width: 362, height: 108 },
  // Equal 40px clear space from the left and bottom trim edges.
  backSignature: { x: 52, y: 514, width: 114, height: 34 },
  // Exact geometry from the approved quiet v41 proof, cropped by the print canvas.
  thread: { x: 0, y: 0, width: 914.876, height: 600 },
  note: { x: 52, y: 42, width: 784, bottom: 330 },
  qr: { x: 52, y: 352, width: 144, height: 144 },
  caption: { x: 224, y: 356, width: 222, bottom: 530 },
  // Lob's 6 x 9 template. Keep all ink outside this lower-right region.
  postal: { x: 477.6, y: 348, width: 384, height: 228 },
} as const;

// Shared with preflight so print CSS and measured copy cannot drift apart.
export const POSTCARD_TYPE = {
  dedication: { size: 20, lineHeight: 28 },
  salutation: { size: 20, lineHeight: 28, gap: 18 },
  sender: { size: 20, lineHeight: 28, gap: 18 },
  instruction: { size: 18, lineHeight: 26, gap: 14 },
  caption: { size: 16, lineHeight: 22 },
} as const;

/** Deliberately cannot receive a collection, transcript, chapter or blessing. */
export type PublicPostcardContent = {
  recipientFirstName: string;
  storytellerFirstName: string;
  publicMessage: string;
};
export type PostcardDesignAssets = {
  signaturePng: string;
  signatureLightPng: string;
  approvedThreadPng: string;
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
  const size = message.length <= 90 ? 34 : message.length <= 160 ? 30 : 24;
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
    !value.startsWith(`data:${mime};base64,`) ||
    !/^[A-Za-z0-9+/=]+$/.test(value.slice(value.indexOf(",") + 1))
  )
    throw new Error("Postcard artwork requires embedded print assets.");
}

export function renderPostcardDesign(
  content: PublicPostcardContent,
  assets: PostcardDesignAssets,
) {
  for (const asset of [
    assets.signaturePng,
    assets.signatureLightPng,
    assets.approvedThreadPng,
    assets.qrPng,
  ])
    assertDataAsset(asset, "image/png");
  assertDataAsset(assets.quicksandPrintTtf, "font/ttf");
  const type = postcardMessageTypography(content.publicMessage);
  const layout = POSTCARD_LAYOUT;
  const text = POSTCARD_TYPE;
  // Static TTF is supported by Lob's print renderer. Keep the web font separate.
  const typography = `@font-face{font-family:Quicksand;src:url(${assets.quicksandPrintTtf}) format('truetype');font-weight:500;font-style:normal;font-display:block}`;
  const base = `${typography}*{box-sizing:border-box}html,body{width:${layout.width / 96}in;height:${layout.height / 96}in;margin:0;overflow:hidden}body{position:relative;color:${BRAND_COLORS.espresso};font-family:Quicksand,Arial,sans-serif;font-weight:500}p{margin:0;overflow-wrap:break-word;word-wrap:break-word}img{display:block}.signature{position:absolute;object-fit:contain;object-position:left center}`;
  const document = (css: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'"><style>${base}${css}</style></head><body data-postcard-size="6x9" data-postcard-design="${POSTCARD_DESIGN_VERSION}">${body}</body></html>`;
  const front = document(
    `body{background:#432e23;background:linear-gradient(120deg,#432e23 0%,#756454 100%);color:white}.art-canvas{position:absolute;left:0;top:0;width:${layout.width}px;height:${layout.height}px;overflow:hidden}.thread{position:absolute;left:${layout.thread.x}px;top:${layout.thread.y}px;width:${layout.thread.width}px;height:${layout.thread.height}px;opacity:.32}.signature{left:${layout.signature.x}px;top:${layout.signature.y}px;width:${layout.signature.width}px;height:${layout.signature.height}px}.tagline{position:absolute;left:80px;top:336px;width:728px;text-align:center;font-size:30px;line-height:40px}.dedication{position:absolute;left:80px;top:522px;width:728px;text-align:center;font-size:${text.dedication.size}px;line-height:${text.dedication.lineHeight}px}`,
    `<div class="art-canvas" aria-hidden="true"><img class="thread" alt="" src="${assets.approvedThreadPng}"></div><img class="signature" alt="Time Tapestry" src="${assets.signatureLightPng}"><p class="tagline">Stories woven together.</p><p class="dedication" data-print-bottom="570">From ${escapeHtml(content.storytellerFirstName)}, for ${escapeHtml(content.recipientFirstName)}.</p>`,
  );
  const back = document(
    `body{background:white}.content{position:absolute;left:${layout.note.x}px;top:${layout.note.y}px;width:${layout.note.width}px}.salutation{font-size:${text.salutation.size}px;line-height:${text.salutation.lineHeight}px;margin-bottom:${text.salutation.gap}px}.message{font-size:${type.size}px;line-height:${type.lineHeight}px;white-space:pre-line}.sender{font-size:${text.sender.size}px;line-height:${text.sender.lineHeight}px;margin-top:${text.sender.gap}px}.qr{position:absolute;left:${layout.qr.x}px;top:${layout.qr.y}px;width:${layout.qr.width}px;height:${layout.qr.height}px}.caption{position:absolute;left:${layout.caption.x}px;top:${layout.caption.y}px;width:${layout.caption.width}px}.instruction{font-size:${text.instruction.size}px;line-height:${text.instruction.lineHeight}px;margin-bottom:${text.instruction.gap}px}.sign-in{font-size:${text.caption.size}px;line-height:${text.caption.lineHeight}px}.signature{left:${layout.backSignature.x}px;top:${layout.backSignature.y}px;width:${layout.backSignature.width}px;height:${layout.backSignature.height}px}.ink-free{position:absolute;left:${layout.postal.x}px;top:${layout.postal.y}px;width:${layout.postal.width}px;height:${layout.postal.height}px;background:white}`,
    `<div class="content" data-print-bottom="${layout.note.bottom}"><p class="salutation">Dear ${escapeHtml(content.recipientFirstName)},</p><p class="message">${escapeHtml(content.publicMessage)}</p><p class="sender">From ${escapeHtml(content.storytellerFirstName)}</p></div><img class="qr" alt="Scan to open your private story page" src="${assets.qrPng}"><div class="caption" data-print-bottom="${layout.caption.bottom}"><p class="instruction">${POSTCARD_BACK_INSTRUCTION}</p><p class="sign-in">${POSTCARD_BACK_CAPTION}</p></div><img class="signature" alt="Time Tapestry" src="${assets.signaturePng}"><div class="ink-free" aria-hidden="true"></div>`,
  );
  return { front, back };
}
