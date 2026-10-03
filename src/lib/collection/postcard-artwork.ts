import QRCode from "qrcode";
import { appOrigin } from "./access";
import { recipientPostcardUrl } from "./postcard-access";
import { renderPostcardDesign } from "./postcard-design";
import { assertPostcardTextFits, postcardPrintContent } from "./postcard-fit";
import { postcardPrintAssets } from "./postcard-print-assets";
import { PUBLIC_POSTCARD_MESSAGE_LIMIT } from "./postcard-public-message";
import type { Collection } from "./types";

export const POSTCARD_COPY_LIMIT = PUBLIC_POSTCARD_MESSAGE_LIMIT;
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
  return recipientPostcardUrl(c.id, chapterId, originUrl(origin));
}
export async function postcardArtwork(
  c: Collection,
  chapterId: string,
  origin = appOrigin(),
) {
  const chapter = c.chapters.find((item) => item.id === chapterId);
  if (!chapter || !chapter.editorialReviewed || c.status !== "approved")
    throw new Error("Approve the story before mailing.");
  assertPostcardTextFits(c, chapterId);
  const [assets, qrPng] = await Promise.all([
    postcardPrintAssets(),
    QRCode.toDataURL(recipientChapterUrl(c, chapterId, origin), {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 4,
    }),
  ]);
  return renderPostcardDesign(postcardPrintContent(c, chapterId), {
    ...assets,
    qrPng,
  });
}
