import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { brandSvg, BRAND_COLORS, type BrandArtworkVariant } from "../src/lib/brand-art";

// Use the SVG source to produce matching raster assets for email clients.
const load = createRequire(`${process.cwd()}/package.json`);
const sharp = load("sharp");
async function main() {
await mkdir("public/brand", { recursive: true });
for (const variant of ["mark", "wordmark", "lockup"] as BrandArtworkVariant[]) {
  for (const [suffix, color] of [["", BRAND_COLORS.espresso], ["-light", "#ffffff"]]) {
    const svg = brandSvg(variant, color);
    const path = `public/brand/time-tapestry-${variant}${suffix}`;
    await writeFile(`${path}.svg`, svg);
    await sharp(Buffer.from(svg)).resize(variant === "mark" ? 512 : 1200).png().toFile(`${path}.png`);
  }
}
await writeFile("src/app/icon.svg", brandSvg("mark"));
await mkdir("video/hyperframes/assets", { recursive: true });
await writeFile("video/hyperframes/assets/time-tapestry-lockup.svg", brandSvg("lockup"));
console.log("Exported six matching SVG/PNG brand assets and app icon.");

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
