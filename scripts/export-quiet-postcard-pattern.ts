import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Reproduce the exact thread asset from the approved quiet brown v41 proof.
// The renderer applies the original crop and opacity inside its print canvas.
const source = "public/brand/patterns/approved-flowing-thread_v39.svg";
const output = "public/brand/time-tapestry-quiet-flowing-thread-v41.png";
async function main() {
const svg = await readFile(source);
if (
  createHash("sha256").update(svg).digest("hex") !==
  "d2c0e0d02285a6959553943597f74eccf974a372b4585be87b57ce699cb20b15"
)
  throw new Error("Approved quiet postcard source changed. Review a new version first.");
const png = await sharp(svg, { density: 600 })
  .resize({ width: 2860 })
  .png()
  .toBuffer();
let existing: Buffer | undefined;
try {
  existing = await readFile(output);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (existing && !existing.equals(png))
  throw new Error("Existing print asset differs. Export to a new version before review.");
if (!existing) await writeFile(output, png, { flag: "wx" });
console.log(JSON.stringify({ output, sha256: createHash("sha256").update(png).digest("hex"), changed: !existing }));
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Print export failed.");
  process.exitCode = 1;
});
