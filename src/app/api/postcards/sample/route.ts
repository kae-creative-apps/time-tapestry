import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { renderPostcardDesign } from "@/lib/collection/postcard-design";
import { assertPublicPostcardFits } from "@/lib/collection/postcard-fit";
import { postcardPrintAssets } from "@/lib/collection/postcard-print-assets";
import { PUBLIC_POSTCARD_DEFAULTS } from "@/lib/collection/postcard-public-message";
import { appOrigin } from "@/lib/collection/access";

export const runtime = "nodejs";

/** Fixed, fictional sample. No collection identifiers, keys or user input. */
export async function GET() {
  const content = {
    recipientFirstName: "Anna",
    storytellerFirstName: "Evelyn",
    publicMessage: PUBLIC_POSTCARD_DEFAULTS.q1,
  };
  assertPublicPostcardFits(content);
  const [assets, qrPng] = await Promise.all([
    postcardPrintAssets(),
    QRCode.toDataURL(new URL("/demo", appOrigin()).toString(), {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 4,
    }),
  ]);
  const printAssets = { ...assets, qrPng };
  const artwork = renderPostcardDesign(content, printAssets);
  const fronts = Object.values(PUBLIC_POSTCARD_DEFAULTS).map(
    (publicMessage) => {
      const cardContent = { ...content, publicMessage };
      assertPublicPostcardFits(cardContent);
      return renderPostcardDesign(cardContent, printAssets).front;
    },
  );
  return NextResponse.json(
    { ...artwork, fronts },
    {
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
