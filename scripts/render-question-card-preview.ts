/** Local preview of the five-second question card. Does not queue a film. */
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const question = process.argv[2];
const label = process.argv[3] || "Kindness";
const output = process.argv[4];
const still = process.argv[5];
if (!question || !output || !still) {
  throw new Error(
    "Usage: render-question-card-preview.ts <question> <label> <mp4> <png>",
  );
}

const font = path.resolve("public/brand/fonts/inter-latin-400.woff2");
const music = path.resolve("public/brand/audio/question-card-bed.wav");
const files = new Map([
  ["/font", { file: font, type: "font/woff2" }],
  ["/music", { file: music, type: "audio/wav" }],
]);

async function main() {
  const server = createServer(async (request, response) => {
    const asset = files.get((request.url || "").split("?")[0]);
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    const { size } = await stat(asset.file);
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Content-Length": size,
      "Access-Control-Allow-Origin": "*",
    });
    createReadStream(asset.file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Preview server did not start.");
  const origin = `http://127.0.0.1:${address.port}`;
  const inputProps = {
    card: {
      question,
      label,
      durationMs: 5000 as const,
      music: {
        relativePath: "question-card-music.wav",
        sha256: "0".repeat(64),
      },
    },
    musicSrc: `${origin}/music`,
    fontSrc: `${origin}/font`,
  };

  try {
    const serveUrl = await bundle({
      entryPoint: path.resolve("video/remotion/index.ts"),
    });
    const composition = await selectComposition({
      serveUrl,
      id: "QuestionCardPreview",
      inputProps,
      logLevel: "error",
    });
    await mkdir(path.dirname(output), { recursive: true });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: output,
      inputProps,
      crf: 18,
      overwrite: true,
      logLevel: "error",
    });
    await renderStill({
      composition,
      serveUrl,
      output: still,
      frame: 36,
      inputProps,
      logLevel: "error",
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main();
