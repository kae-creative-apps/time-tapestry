import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const sharp = createRequire(`${process.cwd()}/package.json`)("sharp");

async function main() {
  // Exact approved stitch repeat. Preserve the source and every path and fill.
  const source = await readFile("public/brand/patterns/approved-interlocking-pattern_v39.svg", "utf8");
  await sharp(Buffer.from(source)).resize(3000).png().toFile("public/brand/time-tapestry-ribbon-print-v1.png");
}

main().catch(() => { console.error("Could not export the postcard pattern."); process.exitCode = 1; });
