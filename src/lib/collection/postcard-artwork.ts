import { createHash } from "node:crypto";
import { assertPostcardTextFits, postcardFontSha256 } from "./postcard-fit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { BRAND_COLORS } from "../brand-art";
import { appOrigin } from "./access";
import type { Collection } from "./types";

export const POSTCARD_COPY_LIMIT = 1000;
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"'{}]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "{": "&#123;",
        "}": "&#125;",
      })[c]!,
  );
}
export function originUrl(origin: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password) {
    console.error(
      "Delivery requires NEXT_PUBLIC_APP_URL to be a public HTTPS app origin.",
    );
    throw new Error(
      "Delivery is not ready yet because the story link needs a secure HTTPS address.",
    );
  }
  return url.origin;
}
export function recipientChapterUrl(
  c: Collection,
  chapterId: string,
  origin = appOrigin(),
) {
  return (
    originUrl(origin) +
    "/collection/" +
    encodeURIComponent(c.id) +
    "/chapter/" +
    encodeURIComponent(chapterId) +
    "?key=" +
    encodeURIComponent(c.recipientKey)
  );
}
export async function postcardArtwork(
  c: Collection,
  chapterId: string,
  origin = appOrigin(),
) {
  const chapter = c.chapters.find((ch) => ch.id === chapterId);
  if (!chapter || !chapter.editorialReviewed || c.status !== "approved")
    throw new Error("Approve the story before mailing.");
  const message = c.chapterBlessings[chapterId];
  const copy = [
    chapter.postcardNote,
    message?.encouragement,
    message?.scriptureText,
    message?.scriptureReference,
    message?.scriptureTranslation,
  ].filter(Boolean);
  if (copy.join("").length > POSTCARD_COPY_LIMIT)
    throw new Error(
      "Postcard copy exceeds 1000 characters. Create a shorter approved postcard revision before mailing.",
    );
  assertPostcardTextFits(c, chapterId);
  const [logoBytes, fontBytes] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-lockup.png")),
    readFile(
      path.join(process.cwd(), "public/brand/fonts/quicksand-latin.woff2"),
    ),
  ]);
  if (
    createHash("sha256").update(fontBytes).digest("hex") !== postcardFontSha256
  )
    throw new Error(
      "The print font changed and needs a layout validation before mailing.",
    );
  const logo = `data:image/png;base64,${logoBytes.toString("base64")}`;
  const font = `@font-face{font-family:Quicksand;src:url(data:font/woff2;base64,${fontBytes.toString("base64")}) format('woff2');font-weight:300 700;font-style:normal;font-display:block}`;
  const qr = await QRCode.toDataURL(recipientChapterUrl(c, chapterId, origin), {
    errorCorrectionLevel: "M",
    width: 600,
    margin: 4,
  });
  const note = "<p>" + escapeHtml(chapter.postcardNote) + "</p>";
  const encouragement = message?.encouragement
    ? "<p>" + escapeHtml(message.encouragement) + "</p>"
    : "";
  const scripture = message?.scriptureText
    ? '<p class="scripture">' + escapeHtml(message.scriptureText) + "</p>"
    : "";
  const attribution = [
    message?.scriptureReference,
    message?.scriptureTranslation,
  ]
    .filter(Boolean)
    .join(" · ");
  const front =
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'\"><style>" +
    font +
    `*{box-sizing:border-box}body{position:relative;width:6.25in;height:4.25in;margin:0;background:${BRAND_COLORS.paper};color:${BRAND_COLORS.espresso};font:11pt/1.2 Quicksand,Arial,sans-serif}` +
    ".content{position:absolute;left:.375in;top:.30in;width:5.5in}.brand{display:block;width:1.15in;height:.344in;object-fit:contain;margin-bottom:.10in}h1{font-family:Quicksand,Arial,sans-serif;font-size:21pt;font-weight:600;line-height:1.1;overflow-wrap:anywhere;margin:.10in 0 .15in}p{margin:0 0 .11in;overflow-wrap:anywhere}.label{font:9pt Quicksand,Arial,sans-serif;letter-spacing:1px}.scripture{font-style:italic}.reference{font-size:10pt}" +
    '</style></head><body><div class="content"><img class="brand" alt="Time Tapestry" src="' +
    logo +
    '"><h1>' +
    escapeHtml(chapter.title) +
    '</h1><p class="label">From ' +
    escapeHtml(c.storyteller.name) +
    "</p>" +
    note +
    encouragement +
    scripture +
    (attribution
      ? '<p class="reference">' + escapeHtml(attribution) + "</p>"
      : "") +
    "</div></body></html>";
  // Lob's official 4x6 template reserves the lower-right 3.2835in x 2.375in.
  const back =
    "<!doctype html><html><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'\"><style>" +
    font +
    `*{box-sizing:border-box}body{position:relative;width:6.25in;height:4.25in;margin:0;background:white;color:${BRAND_COLORS.espresso};font:12pt/1.3 Quicksand,Arial,sans-serif}` +
    ".intro{overflow-wrap:anywhere;position:absolute;top:.35in;left:.35in;width:5.5in}.qr{position:absolute;left:.35in;top:1.6in;width:1.5in;height:1.5in}.caption{position:absolute;left:.35in;top:3.1in;width:2.2in;font-size:10pt}" +
    ".ink-free{position:absolute;right:.275in;bottom:.25in;width:3.2835in;height:2.375in;background:white}" +
    '</style></head><body><div class="intro">A story from ' +
    escapeHtml(c.storyteller.name) +
    ", made for " +
    escapeHtml(c.recipient.name) +
    '.<br>Scan to read all four stories and watch any included videos.</div><img class="qr" alt="Open your stories" src="' +
    qr +
    '"><div class="caption">Read, watch and send a reply on your story page.<br>Keep this card private.</div><div class="ink-free"></div></body></html>';
  return { front, back };
}
