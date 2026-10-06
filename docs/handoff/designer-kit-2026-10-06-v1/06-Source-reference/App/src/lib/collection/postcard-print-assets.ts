import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { postcardFontSha256 } from "./postcard-fit";

export async function postcardPrintAssets() {
  const [signature, signatureLight, thread, font] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-lockup.png")),
    readFile(
      path.join(process.cwd(), "public/brand/time-tapestry-lockup-light.png"),
    ),
    // Exact embedded art from the user-approved quiet brown v41 print proof.
    readFile(
      path.join(process.cwd(), "public/brand/time-tapestry-quiet-flowing-thread-v41.png"),
    ),
    readFile(
      path.join(
        process.cwd(),
        "public/brand/fonts/quicksand-print-medium-v1.ttf",
      ),
    ),
  ]);
  if (createHash("sha256").update(font).digest("hex") !== postcardFontSha256)
    throw new Error(
      "The print font changed and needs a layout validation before mailing.",
    );
  return {
    signaturePng: `data:image/png;base64,${signature.toString("base64")}`,
    signatureLightPng: `data:image/png;base64,${signatureLight.toString("base64")}`,
    approvedThreadPng: `data:image/png;base64,${thread.toString("base64")}`,
    quicksandPrintTtf: `data:font/ttf;base64,${font.toString("base64")}`,
  };
}
