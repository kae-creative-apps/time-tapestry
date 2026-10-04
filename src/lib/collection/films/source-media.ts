import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { mediaBytes } from "../media";
import { getMedia, mutateRecord } from "../store";
import { fileHash, privateJson, probeFilm } from "./render";
import { sha256 } from "./plan";
import {
  originalProbeKey,
  sourceMetadataHash,
  type OriginalProbe,
} from "./original-plan";
import type { StoryFilmJob } from "./types";

const exec = promisify(execFile);
const exists = (file: string) =>
  stat(file)
    .then(() => true)
    .catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    });
const extension = (mime: string) =>
  mime.includes("webm")
    ? ".webm"
    : mime.includes("quicktime")
      ? ".mov"
      : mime.includes("mp4")
        ? ".mp4"
        : mime.includes("mpeg")
          ? ".mp3"
          : mime.includes("ogg")
            ? ".ogg"
            : ".wav";

export async function stageOriginalSource(
  job: StoryFilmJob,
  mediaId: string,
  root: string,
) {
  const snapshot = job.originalSources?.find(
    (source) => source.mediaId === mediaId,
  );
  const media = await getMedia(mediaId);
  if (
    !snapshot ||
    !media ||
    media.collectionId !== job.collectionId ||
    media.role !== "owner" ||
    sourceMetadataHash(media) !== snapshot.metadataSha256
  )
    throw new Error(
      "A selected original changed or is not authorized for this collection.",
    );
  const originalRoot = path.join(root, "originals"),
    mediaRoot = path.join(root, "source-media");
  await mkdir(originalRoot, { recursive: true, mode: 0o700 });
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  const original = path.join(
    originalRoot,
    `${mediaId}${extension(media.mimeType)}`,
  );
  const bytes = await mediaBytes(media);
  const originalSha256 = sha256(bytes);
  if (await exists(original)) {
    if ((await fileHash(original)) !== originalSha256)
      throw new Error(
        "An original changed after this job started. Its preserved copy has not been overwritten.",
      );
  } else await writeFile(original, bytes, { flag: "wx", mode: 0o600 });
  let playable = original;
  let measured;
  try {
    measured = await probeFilm(original);
  } catch {
    playable = path.join(
      mediaRoot,
      `seekable-${mediaId}${extension(media.mimeType)}`,
    );
    if (!(await exists(playable))) {
      const temporary = path.join(
        mediaRoot,
        `seekable-${mediaId}-${randomBytes(6).toString("hex")}${extension(media.mimeType)}`,
      );
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-i",
          original,
          "-map",
          "0:v?",
          "-map",
          "0:a:0",
          "-c",
          "copy",
          temporary,
        ],
        { timeout: 180000 },
      );
      await probeFilm(temporary);
      await rename(temporary, playable);
    }
    measured = await probeFilm(playable);
  }
  if (!measured.types.includes("audio"))
    throw new Error(
      "An original recording has no audio track. Its video is preserved, but a spoken film cannot be made from it.",
    );
  const durationMs = Math.floor(measured.durationSeconds * 1000);
  if (durationMs > 7200000)
    throw new Error(
      "An original recording exceeds the two-hour source limit and needs an editor check.",
    );
  await mutateRecord<OriginalProbe>(originalProbeKey(mediaId), () => ({
    mediaId,
    metadataSha256: snapshot.metadataSha256,
    sourceSha256: originalSha256,
    durationMs,
  }));
  return {
    media,
    snapshot,
    original,
    originalSha256,
    playable,
    measured,
    durationMs,
    mediaRoot,
  };
}

/** Local derivative only. No speech synthesis, silence removal, or original overwrite. */
export async function originalAudioCopy(
  source: Awaited<ReturnType<typeof stageOriginalSource>>,
  level: boolean,
) {
  const output = path.join(
    source.mediaRoot,
    `${level ? "leveled" : "voice"}-${source.media.id}.wav`,
  );
  const receiptFile = `${output}.json`;
  try {
    const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
    if (
      receipt.sourceSha256 === source.originalSha256 &&
      receipt.outputSha256 === (await fileHash(output))
    )
      return {
        file: output,
        sha256: receipt.outputSha256 as string,
        durationMs: receipt.durationMs as number,
      };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(
    source.mediaRoot,
    `audio-${randomBytes(10).toString("hex")}.wav`,
  );
  const filter = `aresample=async=1:first_pts=0,${level ? "loudnorm=I=-16:TP=-1.5:LRA=11," : ""}apad,atrim=duration=${source.durationMs / 1000}`;
  await exec(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      source.playable,
      "-map",
      "0:a:0",
      "-vn",
      "-af",
      filter,
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      temporary,
    ],
    { timeout: 180000 },
  );
  const probe = await probeFilm(temporary);
  if (Math.abs(probe.durationSeconds * 1000 - source.durationMs) > 100)
    throw new Error(
      "The audio derivative did not preserve the original timing.",
    );
  const outputSha256 = await fileHash(temporary);
  await rename(temporary, output);
  const receipt = {
    sourceSha256: source.originalSha256,
    outputSha256,
    durationMs: Math.round(probe.durationSeconds * 1000),
    method: level ? "ffmpeg-loudnorm" : "ffmpeg-extract",
    filter,
  };
  await privateJson(receiptFile, receipt);
  return { file: output, sha256: outputSha256, durationMs: receipt.durationMs };
}
