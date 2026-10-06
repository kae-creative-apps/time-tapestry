import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  writeFile,
  readFile,
  stat,
  copyFile,
  mkdir,
  rename,
  unlink,
} from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { dataRoot, getMedia, putMedia } from "../store";
import { reserveMediaUpload, finalizeMediaUpload } from "../usage";
import { clipTiming, VIDEO_FPS } from "../../video-plan";
import { fileHash, probeFilm } from "./render";
import { sha256 } from "./plan";
import type { prepareOriginalChapter } from "./original-render";
import type { FilmChapter, StoryFilmJob } from "./types";
import type {
  StoryPlaybackArtifact,
  PlaybackWord,
} from "../../audio/playback-types";
import type { StoredMedia } from "../types";
const exec = promisify(execFile);
/** Cuts are burned into a private derivative. Browser skipping is never an access control. */
export async function prepareChapterPlayback(
  job: StoryFilmJob,
  chapter: FilmChapter,
  prepared: Awaited<ReturnType<typeof prepareOriginalChapter>>,
  work: string,
  assertCurrent: () => Promise<void>,
): Promise<StoryPlaybackArtifact> {
  const { plan, assets } = prepared;
  const audioSources = plan.sources.map((source) => {
    const asset = assets.get(
      source.audioDerivative ? `${source.assetId}:audio` : source.assetId,
    );
    if (!asset) throw new Error("The chapter audio source is missing.");
    return { id: source.assetId, file: asset.file };
  });
  const graph: string[] = [];
  for (const [sourceIndex, source] of audioSources.entries()) {
    const indices = plan.clips.flatMap((clip, index) =>
      clip.sourceAssetId === source.id ? [index] : [],
    );
    if (!indices.length)
      throw new Error("An unused source cannot enter chapter playback.");
    graph.push(
      `[${sourceIndex}:a:0]asplit=${indices.length}${indices.map((index) => `[raw${index}]`).join("")}`,
    );
  }
  let elapsedMs = 0;
  const words: PlaybackWord[] = [];
  plan.clips.forEach((clip, index) => {
    const timing = clipTiming(clip);
    const durationMs = (timing.durationFrames * 1000) / VIDEO_FPS;
    const first = clip.captions[0],
      last = clip.captions.at(-1);
    const fadeIn = Math.min(
      15,
      clip.audioFadeInMs ?? 0,
      Math.max(0, (first?.startMs ?? timing.inMs) - timing.inMs),
    );
    const fadeOut = Math.min(
      15,
      clip.audioFadeOutMs ?? 0,
      Math.max(0, timing.outMs - (last?.endMs ?? timing.outMs)),
    );
    const filters = [
      `atrim=start=${timing.inMs / 1000}:end=${timing.outMs / 1000}`,
      "asetpts=PTS-STARTPTS",
      "aresample=48000",
      "aformat=sample_fmts=fltp:channel_layouts=mono",
      // Source EOF may precede the frame-rounded boundary by a fraction of a frame.
      "apad",
      `atrim=duration=${durationMs / 1000}`,
    ];
    if (fadeIn > 0) filters.push(`afade=t=in:d=${fadeIn / 1000}`);
    if (fadeOut > 0)
      filters.push(
        `afade=t=out:st=${(durationMs - fadeOut) / 1000}:d=${fadeOut / 1000}`,
      );
    graph.push(`[raw${index}]${filters.join(",")}[cut${index}]`);
    for (const word of clip.captions)
      words.push({
        text: word.text,
        startMs: elapsedMs + word.startMs - timing.inMs,
        endMs: elapsedMs + word.endMs - timing.inMs,
      });
    elapsedMs += durationMs;
  });
  if (!plan.clips.length || plan.clips.length > 2000 || elapsedMs > 7_200_000)
    throw new Error("The chapter needs a smaller verified edit.");
  graph.push(
    `${plan.clips.map((_, index) => `[cut${index}]`).join("")}concat=n=${plan.clips.length}:v=0:a=1[out]`,
  );
  const planSha256 = sha256(
    JSON.stringify({ version: "chapter-playback-v1", plan }),
  );
  const { stdout: ffmpegVersion } = await exec("ffmpeg", ["-version"], {
    timeout: 10000,
  });
  const ffmpegMajor = Number(/ffmpeg version (\d+)/.exec(ffmpegVersion)?.[1]);
  const filterFileOption =
    ffmpegMajor >= 8 ? "-/filter_complex" : "-filter_complex_script";
  const output = path.join(work, `playback-${planSha256}.m4a`);
  const filter = path.join(work, `playback-${planSha256}.filter`);
  await assertCurrent();
  await writeFile(filter, graph.join(";\n"), { mode: 0o600 });
  const validCachedOutput = await Promise.all([
    probeFilm(output),
    fileHash(output),
    readFile(`${output}.sha256`, "utf8"),
  ]).then(
    ([probe, actualHash, savedHash]) =>
      /^[a-f0-9]{64}$/.test(savedHash) &&
      actualHash === savedHash &&
      probe.types.includes("audio") &&
      !probe.types.includes("video") &&
      Math.abs(probe.durationSeconds * 1000 - elapsedMs) <= 150,
    () => false,
  );
  if (!validCachedOutput) {
    const temporary = path.join(
      work,
      `playback-${planSha256}-${randomUUID()}.m4a`,
    );
    try {
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          ...audioSources.flatMap((source) => ["-i", source.file]),
          filterFileOption,
          filter,
          "-map",
          "[out]",
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "64k",
          "-ar",
          "24000",
          "-ac",
          "1",
          "-movflags",
          "+faststart",
          "-y",
          temporary,
        ],
        { timeout: 300_000 },
      );
      const measured = await probeFilm(temporary);
      if (
        !measured.types.includes("audio") ||
        measured.types.includes("video") ||
        Math.abs(measured.durationSeconds * 1000 - elapsedMs) > 150
      )
        throw new Error(
          "Chapter audio verification failed. Original recordings are preserved.",
        );
      await assertCurrent();
      await rename(temporary, output);
      await writeFile(`${output}.sha256`, await fileHash(output), {
        mode: 0o600,
      });
    } finally {
      await unlink(temporary).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    }
  }
  const probe = await probeFilm(output);
  if (
    !probe.types.includes("audio") ||
    probe.types.includes("video") ||
    Math.abs(probe.durationSeconds * 1000 - elapsedMs) > 150
  )
    throw new Error(
      "Chapter audio verification failed. Original recordings are preserved.",
    );
  await assertCurrent();
  const outputSha256 = await fileHash(output);
  const id = `playbackmedia_${sha256(`${job.id}:${chapter.chapterId}:${outputSha256}`).slice(0, 48)}`;
  const bytes = (await stat(output)).size;
  // The destination is content-addressed. Repeating a completed upload after a
  // crash can only write the same verified bytes to this exact media identity.
  const existing = await getMedia(id);
  if (
    existing &&
    (existing.collectionId !== job.collectionId ||
      existing.provenance !== "chapter_playback" ||
      existing.bytes !== bytes)
  )
    throw new Error("Playback identity mismatch.");
  if (!existing) {
    await reserveMediaUpload({
      collectionId: job.collectionId,
      mediaId: id,
      bytes,
    });
    const media: StoredMedia = {
      id,
      collectionId: job.collectionId,
      role: "owner",
      provenance: "chapter_playback",
      mimeType: "audio/mp4",
      originalName: `chapter-${chapter.chapterNumber}.m4a`,
      bytes,
      createdAt: new Date().toISOString(),
    };
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `collections/${job.collectionId}/${id}.m4a`,
        createReadStream(output),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "audio/mp4",
        },
      );
      media.url = blob.url;
    } else {
      if (process.env.VERCEL || process.env.KV_REST_API_URL)
        throw new Error("Private playback storage is not configured.");
      const directory = path.join(dataRoot, "media");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      media.localPath = path.join(directory, `${id}.m4a`);
      try {
        await copyFile(output, media.localPath, constants.COPYFILE_EXCL);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "EEXIST" ||
          (await fileHash(media.localPath)) !== outputSha256
        )
          throw error;
      }
    }
    await putMedia(media);
  }
  await finalizeMediaUpload({
    collectionId: job.collectionId,
    mediaId: id,
    bytes,
  });
  return {
    schemaVersion: 1,
    jobId: job.id,
    chapterId: chapter.chapterId,
    mediaId: id,
    sourceTakeIds: chapter.sourceTakeIds,
    sourceSha256: chapter.sourceSha256,
    planSha256,
    outputSha256,
    durationMs: elapsedMs,
    words,
    createdAt: new Date().toISOString(),
  };
}
