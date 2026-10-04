import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const sharp = createRequire(`${process.cwd()}/package.json`)("sharp");
async function main() {
  await mkdir("public/brand", { recursive: true });
  const approved = {
    ribbon: "approved-interlocking-pattern_v39.svg",
    weave: "approved-flowing-thread_v39.svg",
  } as const;
  const inlinePatterns: Record<string, { viewBox: string; body: string }> = {};
  for (const variant of ["ribbon", "weave"] as const) {
    // Keep the original paths and colors. These are copies, never redrawn motifs.
    const svg = await readFile(
      `public/brand/patterns/${approved[variant]}`,
      "utf8",
    );
    const viewBox = svg.match(/\bviewBox="([^"]+)"/)?.[1];
    const body = svg.trim().match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/)?.[1];
    if (!viewBox || !body)
      throw new Error(`Invalid approved pattern: ${approved[variant]}`);
    inlinePatterns[variant] = { viewBox, body };
    const base = `public/brand/time-tapestry-${variant}`;
    await writeFile(`${base}.svg`, svg);
    await sharp(Buffer.from(svg)).resize(1200).png().toFile(`${base}.png`);
    if (variant === "weave")
      await sharp(Buffer.from(svg))
        .resize(3000)
        .png()
        .toFile(`${base}-print-v2.png`);
  }
  await writeFile(
    "src/lib/brand-patterns.ts",
    "// Generated from the exact approved public/brand/patterns SVG files.\n" +
      "// Run scripts/export-brand-patterns.ts to refresh. Do not redraw these paths.\n" +
      `export const APPROVED_BRAND_PATTERNS = ${JSON.stringify(inlinePatterns, null, 2)} as const;\n`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
