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
import {
  fileHash,
  prepareNarration,
  privateJson,
  probeFilm,
  renderNarratedFilm,
} from "./render";
import { prepareAutomaticSources } from "./automatic";
import { prepareOriginalChapter, renderOriginalFilm } from "./original-render";
import { TransientFilmError } from "./transcription";
import { sha256 } from "./plan";
import type {
  FilmChapter,
  NarratedFilmPlan,
  StoryFilmArtifact,
  StoryFilmJob,
} from "./types";
import type { StoredMedia } from "../types";

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
    mimeType: "video/mp4",
    originalName: `story-${chapter.chapterNumber}-${job.mode === "original" ? "original-voice" : "ai-narration"}.mp4`,
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
    if (process.env.VERCEL || process.env.KV_REST_API_URL)
      throw new Error(
        "Shared film storage needs private Blob storage before rendering can publish.",
      );
    const directory = path.join(dataRoot, "media");
    await mkdir(directory, { recursive: true, mode: 0o700 });
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
      c.status === "approved" ||
      !(await filmJobInputsCurrent(claimed, c)) ||
      (await latestFilmJob(claimed.collectionId))?.id !== claimed.id
    )
      throw new Error(
        "The stories changed during film creation. Review the current scripts before generating again.",
      );
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
    if (claimed.mode !== "original" && !process.env.ELEVENLABS_API_KEY)
      throw new Error("ElevenLabs narration is not configured on the worker.");
    if (
      (process.env.VERCEL || process.env.KV_REST_API_URL) &&
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
      const chapters = await prepareAutomaticSources(
        claimed,
        path.join(dataRoot, "film-work", claimed.id),
        assertCurrent,
        async (status, fraction) => {
          await updateFilmJob(claimed.id, token, (job) => ({
            ...job,
            status,
            chapters: job.chapters.map((chapter) =>
              chapter.artifact
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
      if (chapter.artifact) continue;
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
        await progress(chapter.chapterId, "rendering", 0);
        const rendered = await cachedRender(
          work,
          sha256(JSON.stringify(prepared.plan)),
          (file) =>
            renderOriginalFilm(
              prepared,
              file,
              (fraction) => progress(chapter.chapterId, "rendering", fraction),
              assertCurrent,
            ),
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
        const voice = claimed.voice;
        if (!voice)
          throw new Error("The AI narration voice snapshot is missing.");
        await progress(chapter.chapterId, "narrating", 0);
        const audio = await prepareNarration(
          claimed,
          chapter,
          work,
          (fraction) => progress(chapter.chapterId, "narrating", fraction),
          assertCurrent,
        );
        const plan: NarratedFilmPlan = {
          schemaVersion: 1,
          jobId: claimed.id,
          chapterId: chapter.chapterId,
          chapterNumber: chapter.chapterNumber,
          storytellerName: claimed.storytellerName,
          title: chapter.title,
          script: chapter.script,
          sourceTakeIds: chapter.sourceTakeIds,
          sourceSha256: chapter.sourceSha256,
          scriptSha256: chapter.scriptSha256,
          audioSha256: audio.audioSha256,
          audioDurationMs: audio.durationMs,
          words: audio.words,
          narrationKind: "ai_interviewer",
          templateVersion: claimed.templateVersion,
        };
        await privateJson(path.join(work, "plan.json"), plan);
        await progress(chapter.chapterId, "rendering", 0);
        const rendered = await cachedRender(
          work,
          sha256(JSON.stringify(plan)),
          (file) =>
            renderNarratedFilm(
              plan,
              audio.audioFile,
              file,
              (fraction) => progress(chapter.chapterId, "rendering", fraction),
              assertCurrent,
            ),
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
          narrationKind: "ai_interviewer",
          sourceTakeIds: chapter.sourceTakeIds,
          sourceSha256: chapter.sourceSha256,
          scriptSha256: chapter.scriptSha256,
          audioSha256: audio.audioSha256,
          outputSha256: rendered.outputSha256,
          voiceId: voice.voiceId,
          modelId: voice.modelId,
          durationSeconds: rendered.durationSeconds,
          createdAt: new Date().toISOString(),
        };
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
      (await latestFilmJob(claimed.collectionId))?.id !== claimed.id;
    const message =
      error instanceof Error
        ? error.message
        : "Film creation stopped. Completed work is preserved.";
    return await failFilmJob(
      claimed.id,
      token,
      message,
      stale,
      error instanceof TransientFilmError ||
        ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(
          (error as NodeJS.ErrnoException)?.code || "",
        ),
    ).catch(() => getFilmJob(claimed.id));
  } finally {
    clearInterval(heartbeat);
  }
}

export async function runFilmWorkerOnce(workerId = `local-${process.pid}`) {
  await writeWorkerHeartbeat(workerId);
  const job = await claimNextFilmJob(workerId);
  if (!job) return null;
  return processFilmJob(job);
}
