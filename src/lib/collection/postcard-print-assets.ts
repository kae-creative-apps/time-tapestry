import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { postcardFontSha256 } from "./postcard-fit";

export async function postcardPrintAssets() {
  const [signature, thread, font] = await Promise.all([
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-lockup.png")),
    // Generated directly from approved-flowing-thread_v39.svg, with original fills.
    readFile(path.join(process.cwd(), "public/brand/time-tapestry-weave.png")),
    readFile(
      path.join(process.cwd(), "public/brand/fonts/quicksand-latin.woff2"),
    ),
  ]);
  if (createHash("sha256").update(font).digest("hex") !== postcardFontSha256)
    throw new Error(
      "The print font changed and needs a layout validation before mailing.",
    );
  return {
    signaturePng: `data:image/png;base64,${signature.toString("base64")}`,
    approvedThreadPng: `data:image/png;base64,${thread.toString("base64")}`,
    quicksandWoff2: `data:font/woff2;base64,${font.toString("base64")}`,
  };
}
