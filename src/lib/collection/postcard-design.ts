import { BRAND_COLORS } from "../brand-art";

/** One physical design, shared by printed mail, review proofs and sample previews. */
export const POSTCARD_LAYOUT = {
  width: 600,
  height: 408,
  bleed: 12,
  front: { x: 42, y: 42, width: 500, bottom: 304 },
  signature: { x: 42, y: 338, width: 94, height: 29 },
  thread: { x: 450, y: 310, width: 150, height: 98.374 },
  backIntro: { x: 42, y: 80, width: 500, bottom: 140 },
  qr: { x: 42, y: 150, width: 144, height: 144 },
  caption: { x: 42, y: 310, width: 192, bottom: 380 },
  // Lob's 4 x 6 template. Keep all ink outside this lower-right region.
  postal: { x: 258.384, y: 156, width: 315.216, height: 228 },
} as const;

/** Deliberately cannot receive a collection, transcript, chapter or blessing. */
export type PublicPostcardContent = {
  recipientFirstName: string;
  storytellerFirstName: string;
  publicMessage: string;
};
export type PostcardDesignAssets = {
  signaturePng: string;
  approvedThreadPng: string;
  qrPng: string;
  quicksandWoff2: string;
};
export const POSTCARD_BACK_CAPTION =
  "Sign in with the email this gift was sent to. Your stories stay private.";
export const POSTCARD_BACK_INSTRUCTION = "Read, watch and send a reply.";

export function postcardFirstName(name: string, fallback: string) {
  return name.trim().split(/\s+/)[0] || fallback;
}

export function postcardMessageTypography(message: string) {
  const size = message.length <= 90 ? 32 : message.length <= 160 ? 26 : 20;
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
    assets.approvedThreadPng,
    assets.qrPng,
  ])
    assertDataAsset(asset, "image/png");
  assertDataAsset(assets.quicksandWoff2, "font/woff2");
  const type = postcardMessageTypography(content.publicMessage);
  const layout = POSTCARD_LAYOUT;
  const typography = `@font-face{font-family:Quicksand;src:url(${assets.quicksandWoff2}) format('woff2');font-weight:300 700;font-style:normal;font-display:block}`;
  const base = `${typography}*{box-sizing:border-box}html,body{width:6.25in;height:4.25in;margin:0}body{position:relative;color:${BRAND_COLORS.espresso};font-family:Quicksand,Arial,sans-serif}p{margin:0;overflow-wrap:anywhere}img{display:block}.signature{position:absolute;width:${layout.signature.width}px;height:${layout.signature.height}px;object-fit:contain;object-position:left center}`;
  const document = (css: string, body: string) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'"><style>${base}${css}</style></head><body>${body}</body></html>`;
  const front = document(
    `body{background:${BRAND_COLORS.paper}}.content{position:absolute;left:${layout.front.x}px;top:${layout.front.y}px;width:${layout.front.width}px}.salutation{font-size:18px;line-height:24px;font-weight:500;margin-bottom:18px}.message{font-size:${type.size}px;line-height:${type.lineHeight}px;font-weight:500;white-space:pre-line}.sender{font-size:16px;line-height:22px;font-weight:500;margin-top:20px}.signature{left:${layout.signature.x}px;top:${layout.signature.y}px}.thread{position:absolute;left:${layout.thread.x}px;top:${layout.thread.y}px;width:${layout.thread.width}px;height:${layout.thread.height}px;object-fit:contain}`,
    `<img class="thread" alt="" src="${assets.approvedThreadPng}"><div class="content" data-print-bottom="${layout.front.bottom}"><p class="salutation">Dear ${escapeHtml(content.recipientFirstName)},</p><p class="message">${escapeHtml(content.publicMessage)}</p><p class="sender">From ${escapeHtml(content.storytellerFirstName)}</p></div><img class="signature" alt="Time Tapestry" src="${assets.signaturePng}">`,
  );
  const back = document(
    `body{background:white}.signature{left:42px;top:36px}.intro{position:absolute;left:${layout.backIntro.x}px;top:${layout.backIntro.y}px;width:${layout.backIntro.width}px}.from{font-size:20px;line-height:26px;font-weight:500}.instruction{font-size:14px;line-height:20px;margin-top:8px}.qr{position:absolute;left:${layout.qr.x}px;top:${layout.qr.y}px;width:${layout.qr.width}px;height:${layout.qr.height}px}.caption{position:absolute;left:${layout.caption.x}px;top:${layout.caption.y}px;width:${layout.caption.width}px;font-size:13px;line-height:17px}.ink-free{position:absolute;right:.275in;bottom:.25in;width:3.2835in;height:2.375in;background:white}`,
    `<img class="signature" alt="Time Tapestry" src="${assets.signaturePng}"><div class="intro" data-print-bottom="${layout.backIntro.bottom}"><p class="from">A story from ${escapeHtml(content.storytellerFirstName)}</p><p class="instruction">${POSTCARD_BACK_INSTRUCTION}</p></div><img class="qr" alt="Scan to open your private story page" src="${assets.qrPng}"><p class="caption" data-print-bottom="${layout.caption.bottom}">${POSTCARD_BACK_CAPTION}</p><div class="ink-free" aria-hidden="true"></div>`,
  );
  return { front, back };
}
