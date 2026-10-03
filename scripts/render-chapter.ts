/** Offline/queued worker only. Never import into a Next.js request handler. */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  chapterDurationFrames,
  MAX_CHAPTER_SECONDS,
  VIDEO_FPS,
  VIDEO_REVIEW_CHECKLIST,
  validateVideoPlan,
} from "../src/lib/video-plan";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : fallback;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
};

async function sha256(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function probe(file: string) {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    file,
  ]);
  const result = JSON.parse(stdout);
  const duration = Number(result.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Media has no valid duration");
  return {
    duration,
    types: (result.streams || []).map(
      (stream: { codec_type: string }) => stream.codec_type,
    ) as string[],
  };
}

const inside = (root: string, file: string) => file.startsWith(root + path.sep);

async function main() {
  const planFile = path.resolve(option("--plan"));
  const planBytes = await readFile(planFile);
  const draft = args.includes("--draft");
  const plan = validateVideoPlan(JSON.parse(planBytes.toString("utf8")), {
    requireApproval: !draft,
  });
  const mediaRoot = path.resolve(option("--media-root", "video/media"));
  const archiveRoot = path.resolve(option("--archive-root", "video/archive"));
  const output = path.resolve(option("--output"));
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const actualMediaRoot = await realpath(mediaRoot);
  const actualArchiveRoot = await realpath(archiveRoot);
  const actualOutput = path.join(
    await realpath(path.dirname(output)),
    path.basename(output),
  );
  if (
    inside(actualMediaRoot, actualOutput) ||
    inside(actualArchiveRoot, actualOutput) ||
    actualOutput === planFile
  )
    throw new Error("Output must be outside source and archive directories");
  const reservation = await open(actualOutput, "wx", 0o600);
  await reservation.close();
  const assetFiles = new Map<string, string>();
  const archiveManifest: {
    assetId: string;
    sha256: string;
    localArchivePath: string;
    declaredArchiveRef: string;
  }[] = [];

  async function verify(
    relativePath: string,
    expectedHash: string,
    durationMs?: number,
    expectedType?: string,
  ) {
    const file = await realpath(path.join(actualMediaRoot, relativePath));
    if (!inside(actualMediaRoot, file))
      throw new Error("A media symlink escapes the private media root");
    if ((await sha256(file)) !== expectedHash)
      throw new Error("Source media hash changed after the plan was created");
    const metadata = await probe(file);
    if (
      durationMs !== undefined &&
      Math.abs(metadata.duration * 1000 - durationMs) > 150
    )
      throw new Error("Source duration differs from the edit plan");
    if (expectedType && !metadata.types.includes(expectedType))
      throw new Error(`Expected ${expectedType} stream is missing`);
    return file;
  }

  for (const source of plan.sources) {
    const file = await verify(
      source.relativePath,
      source.sha256,
      source.durationMs,
      source.kind,
    );
    const archivePath = path.join(
      actualArchiveRoot,
      source.sha256 + path.extname(file),
    );
    try {
      await copyFile(file, archivePath, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if ((await sha256(archivePath)) !== source.sha256)
      throw new Error("Archive verification failed");
    archiveManifest.push({
      assetId: source.assetId,
      sha256: source.sha256,
      localArchivePath: archivePath,
      declaredArchiveRef: source.archiveRef,
    });
    assetFiles.set(source.assetId, file);
    if (source.audioDerivative) {
      const derivative = source.audioDerivative;
      assetFiles.set(
        `${source.assetId}:audio`,
        await verify(
          derivative.relativePath,
          derivative.sha256,
          derivative.durationMs,
          "audio",
        ),
      );
    }
  }
  if (plan.brandCloser)
    assetFiles.set(
      "brand-closer",
      await verify(
        plan.brandCloser.relativePath,
        plan.brandCloser.sha256,
        4000,
        "video",
      ),
    );

  // Serve only preverified media behind an unpredictable local path. Never serve a directory.
  const token = randomBytes(24).toString("hex");
  const byUrl = new Map(
    [...assetFiles].map(([id, file], index) => [
      `/${token}/${index}`,
      { id, file },
    ]),
  );
  const mediaServer = createServer(async (request, response) => {
    const asset = byUrl.get((request.url || "").split("?")[0]);
    if (!asset || !["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(404).end();
      return;
    }
    try {
      const { size } = await stat(asset.file);
      let start = 0;
      let end = size - 1;
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (start > end || start >= size) {
          response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
      }
      const extension = path.extname(asset.file).toLowerCase();
      const mime =
        (
          {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
          } as Record<string, string>
        )[extension] || "application/octet-stream";
      response.writeHead(range ? 206 : 200, {
        "Content-Type": mime,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (request.method === "HEAD") response.end();
      else
        createReadStream(asset.file, { start, end })
          .on("error", () => response.destroy())
          .pipe(response);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    mediaServer.once("error", reject);
    mediaServer.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = mediaServer.address();
    if (!address || typeof address === "string")
      throw new Error("Private media server did not start");
    const mediaUrls = Object.fromEntries(
      [...byUrl].map(([url, asset]) => [
        asset.id,
        `http://127.0.0.1:${address.port}${url}`,
      ]),
    );
    const inputProps = { plan, mediaUrls, draft };
    const serveUrl = await bundle({
      entryPoint: path.resolve("video/remotion/index.ts"),
    });
    const composition = await selectComposition({
      serveUrl,
      id: "ChapterFilm",
      inputProps,
      logLevel: "error",
    });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      outputLocation: actualOutput,
      concurrency: 2,
      crf: 18,
      overwrite: true,
      logLevel: "error",
    });
    const metadata = await probe(actualOutput);
    const expectedDuration = chapterDurationFrames(plan) / VIDEO_FPS;
    if (
      metadata.duration > MAX_CHAPTER_SECONDS ||
      Math.abs(metadata.duration - expectedDuration) > 0.15
    )
      throw new Error("Rendered duration failed QA");
    if (!metadata.types.includes("video"))
      throw new Error("Rendered file has no video stream");
    const outputHash = await sha256(actualOutput);
    const result = {
      schemaVersion: 1,
      status: "rendered-awaiting-review",
      planId: plan.id,
      sessionId: plan.sessionId,
      chapterId: plan.chapterId,
      revision: plan.revision,
      draft,
      planSha256: createHash("sha256").update(planBytes).digest("hex"),
      outputSha256: outputHash,
      localOutput: actualOutput,
      videoUrl: null,
      storageAccess: "local-private",
      durationSeconds: metadata.duration,
      originalArchive: archiveManifest,
      renderedAt: new Date().toISOString(),
      automatedChecks: {
        duration: "passed",
        sourceHashes: "passed",
        localOriginalArchive: "passed",
        videoStream: "passed",
      },
      humanReview: { status: "pending", checklist: VIDEO_REVIEW_CHECKLIST },
      releaseEligible: false,
      nextStep:
        "Upload to private storage, review this exact output hash, then approve it in the application. Rendering alone never releases a chapter.",
    };
    await writeFile(
      actualOutput + ".result.json",
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    // stdout is a machine-readable result. Do not log media or signed URLs.
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    await new Promise<void>((resolve) => mediaServer.close(() => resolve()));
  }
}

main().catch((error) => {
  process.stderr.write(
    `Chapter render failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
