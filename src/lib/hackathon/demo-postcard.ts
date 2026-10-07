import QRCode from "qrcode";
import {
  POSTCARD_THEMES,
  renderPostcardDesign,
} from "@/lib/collection/postcard-design";
import { assertPublicPostcardFits } from "@/lib/collection/postcard-fit";
import { postcardPrintAssets } from "@/lib/collection/postcard-print-assets";
import {
  HACKATHON_DEMO_ORIGIN,
  HACKATHON_DEMO_STORYTELLER,
  type HackathonDemoChapter,
} from "@/data/hackathon-demo";

/** The actual print renderer, filled with the fictional demo family's card. */
export async function hackathonDemoPostcard(chapter: HackathonDemoChapter) {
  const content = {
    recipientFirstName: HACKATHON_DEMO_STORYTELLER.recipient,
    storytellerFirstName: HACKATHON_DEMO_STORYTELLER.firstName,
    publicMessage: chapter.postcard.message,
    theme: POSTCARD_THEMES[chapter.number - 1],
  };
  assertPublicPostcardFits(content);
  const [assets, qrPng] = await Promise.all([
    postcardPrintAssets(),
    QRCode.toDataURL(new URL(chapter.path, HACKATHON_DEMO_ORIGIN).toString(), {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 4,
    }),
  ]);
  return renderPostcardDesign(content, { ...assets, qrPng });
}
