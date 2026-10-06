import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { postcardFontSha256 } from "./postcard-fit";
import { POSTCARD_THEMES, type PostcardTheme } from "./postcard-design";

export async function postcardPrintAssets() {
  const [signature, font, ...fronts] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-lockup.png")),
    readFile(
      path.join(
        process.cwd(),
        "public/brand/fonts/quicksand-print-medium-v1.ttf",
      ),
    ),
    ...POSTCARD_THEMES.map((theme, index) =>
      readFile(
        path.join(
          process.cwd(),
          `public/brand/postcards/designer-2026-10-06-v2/postcard-${String(index + 1).padStart(2, "0")}-${theme}-print-background.png`,
        ),
      ),
    ),
  ]);
  if (createHash("sha256").update(font).digest("hex") !== postcardFontSha256)
    throw new Error(
      "The print font changed and needs a layout validation before mailing.",
    );
  return {
    signaturePng: `data:image/png;base64,${signature.toString("base64")}`,
    // Exact approved fronts with only the sample dedication removed. Static
    // theme labels, patterns, logo and palette are preserved at 300 dpi.
    approvedFrontPngs: Object.fromEntries(
      POSTCARD_THEMES.map((theme, index) => [
        theme,
        `data:image/png;base64,${fronts[index].toString("base64")}`,
      ]),
    ) as Record<PostcardTheme, string>,
    quicksandPrintTtf: `data:font/ttf;base64,${font.toString("base64")}`,
  };
}
