import { prepareChapterPlayback } from "./playback-render";
import { playbackJobMatchesCollection } from "../playback";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { put } from "@vercel/blob";
import { dataRoot, getCollection, getMedia, putMedia } from "../store";
import {
  finalizeMediaUpload,
  getCollectionUsage,
  reserveMediaUpload,
} from "../usage";
import {
  attachReadyFilms,
  claimNextFilmJob,
  filmJobInputsCurrent,
  failFilmJob,
  getFilmJob,
  latestFilmJob,
  updateFilmJob,
  writeWorkerHeartbeat,
} from "./jobstore";
import { fileHash, privateJson, probeFilm } from "./render";
import { prepareAutomaticSources } from "./automatic";
import { SOURCE_MATCH_REVISION } from "./word-matching";
import { prepareOriginalChapter, renderOriginalFilm } from "./original-render";
import { TransientFilmError } from "./transcription";
import { sha256 } from "./plan";
import { RECORDING_ONLY_FILMS_MESSAGE } from "./policy";
import { chapterDurationFrames, VIDEO_FPS } from "../../video-plan";
import {
  assertFilmDiskSpace,
  FilmDiskSpaceError,
  filmRenderScratchBytes,
  filmSourceScratchBytes,
} from "./disk-space";
import type { FilmChapter, StoryFilmArtifact, StoryFilmJob } from "./types";
import type { StoredMedia } from "../types";

async function sourceScratchBytes(job: StoryFilmJob) {
  const sources = new Map(
    (job.originalSources ?? []).map((source) => [source.mediaId, source]),
  );
  const sizes = await Promise.all(
    [...sources.values()].map(async (source) => {
      const media = await getMedia(source.mediaId);
      if (
        !media ||
        media.collectionId !== job.collectionId ||
        !Number.isSafeInteger(media.bytes) ||
        media.bytes < 0
      )
        return null;
      return { bytes: media.bytes, durationMs: source.durationMs };
    }),
  );
  if (sizes.some((source) => source === null)) return null;
  return filmSourceScratchBytes(sizes.filter((source) => source !== null));
}

let lastDiskPauseLog = 0;
function reportDiskPause(error: FilmDiskSpaceError) {
  if (Date.now() - lastDiskPauseLog >= 60000) {
    console.error(error.message);
    lastDiskPauseLog = Date.now();
  }
}

async function savePrivateFilm(
  job: StoryFilmJob,
  chapter: FilmChapter,
  file: string,
  outputSha256: string,
) {
  const id = `filmmedia_${sha256(`${job.id}:${chapter.chapterId}:${outputSha256}`).slice(0, 48)}`;
  const bytes = (await stat(file)).size;
  const existing = await getMedia(id);
  if (existing) {
    if (existing.collectionId !== job.collectionId || existing.bytes !== bytes)
      throw new Error("Film storage identity mismatch.");
    await finalizeMediaUpload({
      collectionId: job.collectionId,
      mediaId: id,
      bytes,
    });
    if (existing.provenance != "generated_film")
      await putMedia({ ...existing, provenance: "generated_film" });
    return id;
  }
  await reserveMediaUpload({
    collectionId: job.collectionId,
    mediaId: id,
    bytes,
  });
  const media: StoredMedia = {
    id,
    collectionId: job.collectionId,
    role: "owner",
    provenance: "generated_film",
    mimeType: "video/mp4",
    originalName: `story-${chapter.chapterNumber}-original-voice.mp4`,
    bytes,
    createdAt: new Date().toISOString(),
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(
      `collections/${job.collectionId}/${id}.mp4`,
      createReadStream(file),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "video/mp4",
      },
    );
    media.url = blob.url;
  } else {
    if (process.env.VERCEL || process.env.REDIS_URL || process.env.KV_REST_API_URL)
      throw new Error(
        "Shared film storage needs private Blob storage before rendering can publish.",
      );
    const directory = path.join(dataRoot, "media");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await assertFilmDiskSpace(dataRoot, bytes);
    const destination = path.join(directory, `${id}.mp4`);
    try {
      await copyFile(file, destination, constants.COPYFILE_EXCL);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        (await fileHash(destination)) !== outputSha256
      )
        throw error;
    }
    media.localPath = destination;
  }
  await putMedia(media);
  await finalizeMediaUpload({
    collectionId: job.collectionId,
    mediaId: id,
    bytes,
  });
  return id;
}

type Rendered = {
  file: string;
  outputSha256: string;
  durationSeconds: number;
  planSha256: string;
};
async function cachedRender(
  work: string,
  planSha256: string,
  render: (file: string) => Promise<Omit<Rendered, "file">>,
) {
  const receipt = path.join(work, "finished-render.json");
  try {
    const saved = JSON.parse(await readFile(receipt, "utf8")) as Rendered;
    if (
      saved.planSha256 === planSha256 &&
      saved.outputSha256 === (await fileHash(saved.file))
    ) {
      const probe = await probeFilm(saved.file);
      if (probe.types.includes("audio") && probe.types.includes("video"))
        return saved;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const file = path.join(work, `film-${randomUUID()}.mp4`);
  const result = await render(file);
  const saved = {
    file,
    outputSha256: result.outputSha256,
    durationSeconds: result.durationSeconds,
    planSha256: result.planSha256,
  };
  await privateJson(receipt, saved);
  return saved;
}

export async function processFilmJob(
  claimed: StoryFilmJob,
  options: { transcribe?: Parameters<typeof prepareAutomaticSources>[4] } = {},
) {
  const token = claimed.lease?.token;
  if (!token) throw new Error("Claim the film job before processing it.");
  let leaseError: unknown;
  let diskError: FilmDiskSpaceError | undefined;
  const checkDiskSpace = async (additionalBytes = 0) => {
    try {
      await assertFilmDiskSpace(dataRoot, additionalBytes);
    } catch (error) {
      if (error instanceof FilmDiskSpaceError) diskError = error;
      throw error;
    }
  };
  let heartbeatWrite = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatWrite = heartbeatWrite
      .then(async () => {
        await updateFilmJob(claimed.id, token, (job) => job);
      })
      .catch((error) => {
        leaseError = error;
      });
  }, 20000);
  const assertCurrent = async () => {
    if (leaseError) throw leaseError;
    const [job, c] = await Promise.all([
      getFilmJob(claimed.id),
      getCollection(claimed.collectionId),
    ]);
    if (!job || job.lease?.token !== token || job.lease.expiresAt <= Date.now())
      throw new Error(
        "The film worker lease expired. Completed files are preserved.",
      );
    if (
      !c ||
      (c.status === "approved" && !playbackJobMatchesCollection(claimed, c)) ||
      !(await filmJobInputsCurrent(claimed, c)) ||
      (await latestFilmJob(claimed.collectionId))?.id !==
        (claimed.sourceJobId ?? claimed.id)
    )
      throw new Error(
        "The stories changed during film creation. Review the current scripts before generating again.",
      );
    await checkDiskSpace();
  };
  const progress = async (
    chapterId: string,
    status: "preparing" | "narrating" | "rendering",
    fraction: number,
  ) => {
    await updateFilmJob(claimed.id, token, (job) => ({
      ...job,
      status,
      chapters: job.chapters.map((chapter) =>
        chapter.chapterId === chapterId
          ? {
              ...chapter,
              status,
              progress: Math.max(0, Math.min(1, fraction)),
              error: undefined,
            }
          : chapter,
      ),
    }));
  };
  try {
    if (claimed.mode !== "original")
      throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
    const sourceBytes = await sourceScratchBytes(claimed);
    if (sourceBytes === null)
      throw new Error(
        "An original recording is unavailable or its stored size is invalid.",
      );
    await checkDiskSpace(sourceBytes);
    if (
      (process.env.VERCEL || process.env.REDIS_URL || process.env.KV_REST_API_URL) &&
      !process.env.BLOB_READ_WRITE_TOKEN
    )
      throw new Error("Shared film storage needs private Blob storage.");
    const usage = await getCollectionUsage(claimed.collectionId);
    if (usage.remainingBytes < 1024 * 1024)
      throw new Error(
        "This collection needs more storage before making films.",
      );
    if (
      claimed.mode === "original" &&
      claimed.preparation === "automatic" &&
      claimed.chapters.some((chapter) => !chapter.sourceEdit)
    ) {
      claimed = await updateFilmJob(claimed.id, token, (job) => ({
        ...job,
        sourceMatchRevision: SOURCE_MATCH_REVISION,
      }));
      const chapters = await prepareAutomaticSources(
        claimed,
        path.join(dataRoot, "film-work", claimed.id),
        assertCurrent,
        async (status, fraction) => {
          await updateFilmJob(claimed.id, token, (job) => ({
            ...job,
            status,
            chapters: job.chapters.map((chapter) =>
              chapter.artifact || chapter.playback
                ? chapter
                : { ...chapter, status, progress: fraction },
            ),
          }));
        },
        options.transcribe,
      );
      claimed = await updateFilmJob(claimed.id, token, (job) => ({
        ...job,
        status: "preparing",
        chapters,
      }));
    }
    for (const chapter of claimed.chapters) {
      await assertCurrent();
      if (
        chapter.artifact ||
        (claimed.outputMode === "interactive" && chapter.playback)
      )
        continue;
      const work = path.join(
        dataRoot,
        "film-work",
        claimed.id,
        chapter.chapterId,
      );
      let artifact: StoryFilmArtifact;
      if (claimed.mode === "original") {
        await progress(chapter.chapterId, "preparing", 0);
        const prepared = await prepareOriginalChapter(
          claimed,
          chapter,
          work,
          assertCurrent,
          (fraction) => progress(chapter.chapterId, "preparing", fraction),
        );
        if (claimed.outputMode === "interactive") {
          const playback = await prepareChapterPlayback(
            claimed,
            chapter,
            prepared,
            work,
            assertCurrent,
          );
          await updateFilmJob(claimed.id, token, (job) => ({
            ...job,
            chapters: job.chapters.map((item) =>
              item.chapterId === chapter.chapterId
                ? { ...item, status: "ready", progress: 1, playback }
                : item,
            ),
          }));
          continue;
        }
        await progress(chapter.chapterId, "rendering", 0);
        const rendered = await cachedRender(
          work,
          sha256(JSON.stringify(prepared.plan)),
          async (file) => {
            const durationSeconds =
              chapterDurationFrames(prepared.plan) / VIDEO_FPS;
            await checkDiskSpace(filmRenderScratchBytes(durationSeconds));
            return renderOriginalFilm(
              prepared,
              file,
              (fraction) => progress(chapter.chapterId, "rendering", fraction),
              assertCurrent,
            );
          },
        );
        await assertCurrent();
        const mediaId = await savePrivateFilm(
          claimed,
          chapter,
          rendered.file,
          rendered.outputSha256,
        );
        artifact = {
          jobId: claimed.id,
          chapterId: chapter.chapterId,
          mediaId,
          narrationKind: "original_recording",
          sourceTakeIds: chapter.sourceTakeIds,
          sourceSha256: chapter.sourceSha256,
          outputSha256: rendered.outputSha256,
          durationSeconds: rendered.durationSeconds,
          createdAt: new Date().toISOString(),
          presentation: chapter.sourceEdit!.presentation,
          planSha256: rendered.planSha256,
          sourceRanges: chapter.sourceEdit!.clips,
          sourceAssets: prepared.sourceAssets,
        };
      } else {
        throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
      }
      await updateFilmJob(claimed.id, token, (job) => ({
        ...job,
        chapters: job.chapters.map((item) =>
          item.chapterId === chapter.chapterId
            ? { ...item, status: "ready", progress: 1, artifact }
            : item,
        ),
      }));
    }
    await assertCurrent();
    await attachReadyFilms((await getFilmJob(claimed.id))!);
    clearInterval(heartbeat);
    await heartbeatWrite;
    return await updateFilmJob(claimed.id, token, (job) => ({
      ...job,
      status: "ready",
      error: undefined,
      lease: undefined,
    }));
  } catch (error) {
    clearInterval(heartbeat);
    await heartbeatWrite;
    const c = await getCollection(claimed.collectionId);
    const stale =
      !c ||
      !(await filmJobInputsCurrent(claimed, c)) ||
      (await latestFilmJob(claimed.collectionId))?.id !==
        (claimed.sourceJobId ?? claimed.id);
    // Remotion may surface a cancellation error after a progress callback
    // detects low disk. Keep that original reason when deciding safe recovery.
    const failure = diskError ?? error;
    let message =
      failure instanceof Error
        ? failure.message
        : "Film creation stopped. Completed work is preserved.";
    if (failure instanceof FilmDiskSpaceError && !stale) {
      reportDiskPause(failure);
      if (claimed.mode === "original") {
        // updateFilmJob fences both token and expiry before changing attempts.
        // Keep saved artifacts/receipts and let capacity, not retry count, gate
        // the next attempt. No files are removed or overwritten here.
        return await updateFilmJob(claimed.id, token, (job) => ({
          ...job,
          status: "queued",
          attempts: Math.max(0, job.attempts - 1),
          nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
          error: message,
          lease: undefined,
          chapters: job.chapters.map((chapter) =>
            chapter.artifact || chapter.playback
              ? chapter
              : { ...chapter, status: "queued", error: message },
          ),
        })).catch(() => getFilmJob(claimed.id));
      }
    }
    return await failFilmJob(
      claimed.id,
      token,
      message,
      stale,
      failure instanceof TransientFilmError ||
        ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(
          (failure as NodeJS.ErrnoException)?.code || "",
        ),
    ).catch(() => getFilmJob(claimed.id));
  } finally {
    clearInterval(heartbeat);
  }
}

class FilmWorkerStopping extends Error {}

export async function runFilmWorkerOnce(
  workerId = `local-${process.pid}`,
  options: { shouldStop?: () => boolean } = {},
) {
  const shouldStop = options.shouldStop ?? (() => false);
  if (shouldStop()) return null;
  await writeWorkerHeartbeat(workerId);
  if (shouldStop()) return null;
  let job: StoryFilmJob | null;
  try {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    if (shouldStop()) return null;
    await assertFilmDiskSpace(dataRoot);
    if (shouldStop()) return null;
    job = await claimNextFilmJob(
      workerId,
      Date.now(),
      undefined,
      async (next) => {
        // This hook runs under the job lock after queue/input reads. Throwing
        // ends this poll without claiming or walking more jobs during shutdown.
        if (shouldStop()) throw new FilmWorkerStopping();
        try {
          const sourceBytes = await sourceScratchBytes(next);
          if (shouldStop()) throw new FilmWorkerStopping();
          // Source records can disappear after the input check. Claiming lets
          // processFilmJob settle that bad job without stopping the queue. It
          // repeats this check before staging; storage read errors still throw.
          if (sourceBytes === null) return true;
          await assertFilmDiskSpace(dataRoot, sourceBytes);
          if (shouldStop()) throw new FilmWorkerStopping();
        } catch (error) {
          if (!(error instanceof FilmDiskSpaceError)) throw error;
          reportDiskPause(error);
          return false;
        }
      },
    );
  } catch (error) {
    if (error instanceof FilmWorkerStopping) return null;
    if (!(error instanceof FilmDiskSpaceError)) throw error;
    reportDiskPause(error);
    return null;
  }
  if (!job) return null;
  if (shouldStop()) {
    // A signal can arrive while the successful claim is being persisted. No
    // processing has started, so release this lease and refund its one attempt.
    // updateFilmJob fences token and expiry, preserving a replacement owner.
    const token = job.lease!.token;
    try {
      await updateFilmJob(job.id, token, (current) => ({
        ...current,
        status: "queued",
        attempts: Math.max(0, current.attempts - 1),
        lease: undefined,
      }));
    } catch (error) {
      const current = await getFilmJob(job.id);
      if (
        current?.lease?.token === token &&
        current.lease.expiresAt > Date.now()
      )
        throw error;
    }
    return null;
  }
  return processFilmJob(job);
}
