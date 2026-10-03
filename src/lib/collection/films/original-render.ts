import { bundle } from "@remotion/bundler";
import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  chapterDurationFrames,
  validateVideoPlan,
  VIDEO_FPS,
  type ChapterVideoPlan,
} from "../../video-plan";
import { fileHash, privateJson, probeFilm } from "./render";
import { sha256 } from "./plan";
import { stageOriginalSource, originalAudioCopy } from "./source-media";
import type { FilmChapter, StoryFilmJob } from "./types";

export function validateMeasuredCuts(
  clips: { mediaId: string; inMs: number; outMs: number }[],
  durations: Map<string, number>,
) {
  for (const clip of clips) {
    const duration = durations.get(clip.mediaId);
    if (
      !duration ||
      clip.inMs < 0 ||
      clip.outMs <= clip.inMs ||
      clip.outMs > duration
    )
      throw new Error(
        `A selected range exceeds its recording. The measured length is ${duration ? (duration / 1000).toFixed(3) : "unknown"} seconds. Adjust the saved end point and review the cut again.`,
      );
  }
}

/** Stage originals without altering them. Every derivative has a separate path. */
export async function prepareOriginalChapter(
  job: StoryFilmJob,
  chapter: FilmChapter,
  work: string,
  assertCurrent: () => Promise<void>,
  onProgress: (fraction: number) => Promise<void>,
) {
  if (
    job.mode !== "original" ||
    (!job.cutsApprovedAt && !job.processingConsentAt) ||
    (job.preparation !== "automatic" && !job.allowNoCaptions) ||
    !chapter.sourceEdit
  )
    throw new Error("This original film needs an approved clip selection.");
  const root = path.dirname(work);
  const originalRoot = path.join(root, "originals");
  const mediaRoot = path.join(root, "source-media");
  await mkdir(originalRoot, { recursive: true, mode: 0o700 });
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  await mkdir(work, { recursive: true, mode: 0o700 });
  const unique = [
    ...new Set(chapter.sourceEdit.clips.map((clip) => clip.mediaId)),
  ];
  const assets = new Map<string, { file: string; mime: string }>();
  const sourceAssets: {
    mediaId: string;
    sha256: string;
    durationMs: number;
  }[] = [];
  const sourceDurations = new Map<string, number>();
  const plan: ChapterVideoPlan = {
    schemaVersion: 1,
    id: sha256(`${job.id}:${chapter.chapterId}`),
    sessionId: job.collectionId,
    chapterId: chapter.chapterId,
    chapterNumber: chapter.chapterNumber,
    revision: 1,
    title: chapter.title,
    storytellerName: job.storytellerName,
    sources: [],
    clips: [],
    approval: {
      approvedBy:
        job.preparation === "automatic"
          ? "Automatic source word matching; final owner review required"
          : "Collection owner",
      approvedAt: (job.cutsApprovedAt || job.processingConsentAt)!,
    },
  };
  for (const [index, mediaId] of unique.entries()) {
    await assertCurrent();
    const source = await stageOriginalSource(job, mediaId, root);
    const { media, originalSha256, durationMs, measured } = source;
    if (!source.snapshot.chapterIds.includes(chapter.chapterId))
      throw new Error(
        "This original is not a source for the selected chapter.",
      );
    let playable = source.playable;
    sourceDurations.set(mediaId, durationMs);
    sourceAssets.push({ mediaId, sha256: originalSha256, durationMs });
    const audioOnly =
      chapter.sourceEdit.presentation === "audio" ||
      !media.mimeType.startsWith("video/");
    if (!audioOnly && !measured.types.includes("video"))
      throw new Error("The selected camera recording has no video track.");
    const derivative =
      job.preparation === "automatic" ||
      (audioOnly && media.mimeType.startsWith("video/"))
        ? await originalAudioCopy(source, job.preparation === "automatic")
        : undefined;
    if (audioOnly && derivative) playable = derivative.file;
    const kind = audioOnly ? "audio" : "video";
    const assetId = mediaId;
    const sourceAnswerId = `original:${mediaId}`;
    plan.sources.push({
      assetId,
      sourceAnswerId,
      takeId: mediaId,
      acceptedTakeId: mediaId,
      kind,
      relativePath: `${mediaId}${path.extname(playable)}`,
      sha256: await fileHash(playable),
      durationMs,
      archiveRef: `collection-media:${mediaId}:sha256:${originalSha256}`,
      originalPreserved: true,
      ...(!audioOnly && derivative
        ? {
            audioDerivative: {
              relativePath: `audio-${mediaId}.wav`,
              sha256: derivative.sha256,
              method: "ffmpeg-cleanup" as const,
              durationMs: derivative.durationMs,
            },
          }
        : {}),
    });
    if (!audioOnly && derivative)
      assets.set(`${assetId}:audio`, {
        file: derivative.file,
        mime: "audio/wav",
      });
    assets.set(assetId, {
      file: playable,
      mime: path.extname(playable) === ".wav" ? "audio/wav" : media.mimeType,
    });
    await onProgress((index + 1) / unique.length);
  }
  validateMeasuredCuts(chapter.sourceEdit.clips, sourceDurations);
  plan.clips = chapter.sourceEdit.clips.map((clip, index) => ({
    id: `${chapter.chapterId}-clip-${index + 1}`,
    sourceAssetId: clip.mediaId,
    sourceAnswerId: `original:${clip.mediaId}`,
    kind: plan.sources.find((source) => source.assetId === clip.mediaId)!.kind,
    inMs: clip.inMs,
    outMs: clip.outMs,
    captions: clip.captions ?? [],
    editorialReason:
      job.preparation === "automatic"
        ? "Matched saved source words to measured Scribe word timestamps. Final owner review is required."
        : "The collection owner explicitly selected and reviewed this original recording range. No automatic speech boundaries or captions were inferred.",
  }));
  const closer =
    process.env.STORY_FILM_CLOSER_FILE ||
    path.resolve("public/brand/film-closer-v2.mp4");
  const closerProbe = await probeFilm(closer);
  if (
    !closerProbe.types.includes("video") ||
    Math.abs(closerProbe.durationSeconds - 4) > 0.05
  )
    throw new Error("The brand closer must be four seconds long.");
  plan.brandCloser = {
    relativePath: "brand-closer.mp4",
    sha256: await fileHash(closer),
    durationMs: 4000,
  };
  assets.set("brand-closer", { file: closer, mime: "video/mp4" });
  assets.set("brand-font", {
    file: path.resolve("public/brand/fonts/quicksand-latin.woff2"),
    mime: "font/woff2",
  });
  validateVideoPlan(plan);
  await privateJson(path.join(work, "source-plan.json"), plan);
  await privateJson(path.join(work, "original-provenance.json"), {
    sourceAssets,
    selections: chapter.sourceEdit,
    approvedAt: job.cutsApprovedAt,
    captions:
      job.preparation === "automatic" ? "source-word-timed" : "not-included",
    originalPreserved: true,
  });
  return { plan, assets, sourceAssets };
}

let bundled: Promise<string> | undefined;
export async function renderOriginalFilm(
  prepared: Awaited<ReturnType<typeof prepareOriginalChapter>>,
  output: string,
  onProgress: (fraction: number) => Promise<void>,
  assertCurrent: () => Promise<void>,
) {
  const { plan, assets } = prepared;
  validateVideoPlan(plan);
  for (const source of plan.sources)
    if ((await fileHash(assets.get(source.assetId)!.file)) !== source.sha256)
      throw new Error("A working source changed before rendering.");
  for (const source of plan.sources)
    if (
      source.audioDerivative &&
      (await fileHash(assets.get(`${source.assetId}:audio`)!.file)) !==
        source.audioDerivative.sha256
    )
      throw new Error("A source audio derivative changed before rendering.");
  if (
    (await fileHash(assets.get("brand-closer")!.file)) !==
    plan.brandCloser!.sha256
  )
    throw new Error("The brand closer changed before rendering.");
  const token = randomBytes(24).toString("hex");
  const byUrl = new Map(
    [...assets].map(([id, asset], index) => [
      `/${token}/${index}`,
      { id, ...asset },
    ]),
  );
  const server = createServer(async (request, response) => {
    const asset = byUrl.get((request.url || "").split("?")[0]);
    if (!asset || !["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(404).end();
      return;
    }
    try {
      const { size } = await stat(asset.file);
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) {
        response.writeHead(416).end();
        return;
      }
      response.writeHead(range ? 206 : 200, {
        "Content-Type": asset.mime,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
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
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { cancel, cancelSignal } = makeCancelSignal();
  let progressWrite = Promise.resolve();
  let progressError: unknown;
  let lastProgress = 0;
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("The private media server did not start.");
    const origin = `http://127.0.0.1:${address.port}`;
    const mediaUrls = Object.fromEntries(
      [...byUrl].map(([url, asset]) => [asset.id, `${origin}${url}`]),
    );
    const inputProps = { plan, mediaUrls, draft: false };
    bundled ??= bundle({
      entryPoint: path.resolve("video/remotion/index.ts"),
    }).catch((error) => {
      bundled = undefined;
      throw error;
    });
    const serveUrl = await bundled;
    const composition = await selectComposition({
      serveUrl,
      id: "ChapterFilm",
      inputProps,
      logLevel: "error",
    });
    await assertCurrent();
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: output,
      overwrite: false,
      concurrency: 2,
      crf: 18,
      logLevel: "error",
      cancelSignal,
      onProgress: ({ progress }) => {
        if (Date.now() - lastProgress < 1500 && progress < 1) return;
        lastProgress = Date.now();
        progressWrite = progressWrite
          .then(async () => {
            await assertCurrent();
            await onProgress(progress);
          })
          .catch((error) => {
            progressError = error;
            cancel();
          });
      },
    });
    await progressWrite;
    if (progressError) throw progressError;
    await assertCurrent();
    const result = await probeFilm(output);
    if (
      !result.types.includes("audio") ||
      !result.types.includes("video") ||
      Math.abs(
        result.durationSeconds - chapterDurationFrames(plan) / VIDEO_FPS,
      ) > 0.2
    )
      throw new Error(
        "The original film failed its audio, video, or duration verification.",
      );
    const receipt = {
      schemaVersion: 1,
      status: "rendered-awaiting-review",
      narrationKind: "original_recording",
      outputSha256: await fileHash(output),
      planSha256: sha256(JSON.stringify(plan)),
      durationSeconds: result.durationSeconds,
      sourceAssets: prepared.sourceAssets,
      captions: plan.clips.every((clip) => clip.captions.length)
        ? "source-word-timed"
        : "not-included",
      releaseEligible: false,
    };
    await privateJson(`${output}.result.json`, receipt);
    return receipt;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
