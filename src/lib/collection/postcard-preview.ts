import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { postcardPrintContent, assertPostcardTextFits } from "./postcard-fit";
import { postcardPrintAssets } from "./postcard-print-assets";
import { renderPostcardDesign } from "./postcard-design";
import {
  collectionPostcardCadence,
  postcardScheduledDate,
} from "./postcard-cadence";
import { publicPostcardMessage } from "./postcard-public-message";
import type { Collection } from "./types";
import type { PostcardProofSnapshot } from "./postcard-proofs";

/** Display-only artwork. Never carries a story URL, access key or releasable proof hash. */
export async function buildPostcardPreview(
  c: Collection,
): Promise<PostcardProofSnapshot> {
  const firstMailingAt = `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
  const [assets, qrPng] = await Promise.all([
    postcardPrintAssets(),
    QRCode.toDataURL("https://example.invalid/postcard-preview", {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 4,
    }),
  ]);
  const cards = c.chapters.map((chapter, index) => {
    assertPostcardTextFits(c, chapter.id);
    return {
      chapterId: chapter.id,
      title: `Postcard ${index + 1}`,
      note: publicPostcardMessage(c, chapter.id),
      scheduledFor: postcardScheduledDate(c, firstMailingAt, index),
      ...renderPostcardDesign(postcardPrintContent(c, chapter.id), {
        ...assets,
        qrPng,
      }),
    };
  });
  return {
    version: 2,
    cadence: collectionPostcardCadence(c),
    hash: `preview:${createHash("sha256").update(JSON.stringify(cards)).digest("hex")}`,
    sourceHash: "preview-only",
    collectionVersion: c.approvedVersion || 1,
    origin: "https://example.invalid",
    address: c.address || {
      name: c.recipient.name,
      line1: "Address to be confirmed",
      city: "",
      region: "",
      postalCode: "",
      country: "US",
    },
    firstMailingAt,
    cards,
    releaseStatus: "held",
  };
}
