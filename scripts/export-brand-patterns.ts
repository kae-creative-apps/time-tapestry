import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandPattern } from "../src/components/BrandPattern";

const sharp = createRequire(`${process.cwd()}/package.json`)("sharp");
async function main() {
  await mkdir("public/brand", { recursive: true });
  for (const variant of ["ribbon", "weave"] as const) {
    const svg = renderToStaticMarkup(createElement(BrandPattern, { variant }))
      .replace('fill="none"', 'fill="none" color="#432e23"')
      .replaceAll("var(--weave-secondary, #939480)", "#939480")
      .replaceAll("var(--weave-gap, #fbfaf8)", "#fbfaf8");
    const base = `public/brand/time-tapestry-${variant}`;
    await writeFile(`${base}.svg`, svg);
    await sharp(Buffer.from(svg)).resize(1200).png().toFile(`${base}.png`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
