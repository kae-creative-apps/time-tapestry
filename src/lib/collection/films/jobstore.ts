import { queueFilmsReady } from "../notifications";
import { randomUUID } from "node:crypto";
import {
  getCollection,
  getMedia,
  putMedia,
  mutateCollection,
  mutateRecord,
  readRecord,
} from "../store";
import type { Collection } from "../types";
import { preserveGeneratedFilmProvenance } from "../recording-validation";
import { collectionFilmSourceHash, FILM_TEMPLATE_VERSION } from "./plan";
import { RECORDING_ONLY_FILMS_MESSAGE } from "./policy";
import {
  originalCollectionHash,
  originalJobInputsCurrent,
  prepareOriginalJob,
  prepareAutomaticJob,
  AUTOMATIC_TEMPLATE_VERSION,
  ORIGINAL_TEMPLATE_VERSION,
} from "./original-plan";
import type { FilmJobView, FilmVoice, StoryFilmJob } from "./types";

const registryKey = "story-film-registry";
const indexKey = (id: string) => `film-index-${id}`;
type Index = { ids: string[] };
const nowIso = () => new Date().toISOString();
export const FILM_LEASE_MS = 120000;

export const getFilmJob = (id: string) => {
  if (!/^film_[a-f0-9]{64}$/.test(id)) throw new Error("Invalid film job.");
  return readRecord<StoryFilmJob>(id);
};

export async function latestFilmJob(collectionId: string) {
  const index = await readRecord<Index>(indexKey(collectionId));
  return index?.ids.length ? getFilmJob(index.ids.at(-1)!) : null;
}

export function filmJobView(job: StoryFilmJob): FilmJobView {
  if (job.mode !== "original" && job.status !== "ready") {
    job = retiredNarrationJob(job);
  }
  return {
    id: job.id,
    collectionId: job.collectionId,
    status: job.status,
    mode: job.mode ?? "ai_narration",
    preparation: job.preparation,
    nextAttemptAt: job.nextAttemptAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    scriptsApprovedAt: job.scriptsApprovedAt,
    ...(job.error ? { error: job.error } : {}),
    chapters: job.chapters.map(
      ({ chapterId, title, status, progress, error, artifact }) => ({
        chapterId,
        title,
        status,
        progress,
        error,
        artifact,
      }),
    ),
  };
}

export function filmJobMatches(job: StoryFilmJob, c: Collection) {
  try {
    return (
      job.sourceSha256 ===
      (job.mode === "original"
        ? originalCollectionHash(c)
        : collectionFilmSourceHash(c))
    );
  } catch {
    return false;
  }
}

function filmTemplateCurrent(job: StoryFilmJob) {
  const expected =
    job.mode !== "original"
      ? FILM_TEMPLATE_VERSION
      : job.preparation === "automatic"
        ? AUTOMATIC_TEMPLATE_VERSION
        : ORIGINAL_TEMPLATE_VERSION;
  return job.templateVersion === expected;
}

function filmOutputsAlreadyAttached(job: StoryFilmJob, c: Collection) {
  return (
    job.chapters.length === 4 &&
    job.chapters.every(
      (chapter) =>
        chapter.artifact &&
        c.chapters.find((item) => item.id === chapter.chapterId)?.film
          ?.outputSha256 === chapter.artifact.outputSha256,
    )
  );
}

const outdatedTemplateMessage =
  "The film template changed. Completed files are preserved. Create a new film version from the current reviewed stories.";

function staleTemplateJob(job: StoryFilmJob): StoryFilmJob {
  return {
    ...job,
    status: "stale",
    lease: undefined,
    nextAttemptAt: undefined,
    updatedAt: nowIso(),
    error: outdatedTemplateMessage,
  };
}

function retiredNarrationJob(job: StoryFilmJob): StoryFilmJob {
  return {
    ...job,
    status: "stale",
    lease: undefined,
    nextAttemptAt: undefined,
    error: RECORDING_ONLY_FILMS_MESSAGE,
    chapters: job.chapters.map((chapter) =>
      chapter.artifact
        ? chapter
        : {
            ...chapter,
            status: "stale",
            error: RECORDING_ONLY_FILMS_MESSAGE,
          },
    ),
  };
}

type EnqueueOptions = { now?: Date; dailyLimit?: number };
async function enqueuePreparedJob(
  job: StoryFilmJob,
  options: EnqueueOptions = {},
) {
  const now = options.now ?? new Date();
  const configuredLimit = Number(process.env.STORY_FILM_DAILY_LIMIT || 3);
  const dailyLimit =
    options.dailyLimit ??
    (Number.isInteger(configuredLimit)
      ? Math.max(1, Math.min(10, configuredLimit))
      : 3);
  let result: StoryFilmJob | null = null;
  await mutateRecord<Index>(indexKey(job.collectionId), async (index) => {
    const ids = index?.ids ?? [];
    const current = await getCollection(job.collectionId);
    if (
      !current ||
      current.status === "approved" ||
      !filmJobMatches(job, current) ||
      !(await originalJobInputsCurrent(job))
    )
      throw new Error(
        "Your stories or selected cuts changed. Review the latest version first.",
      );
    const existing = await getFilmJob(job.id);
    if (existing) {
      if (existing.collectionId !== job.collectionId)
        throw new Error("Film identity mismatch.");
      result = existing;
      await mutateRecord<Index>(registryKey, (registry) => ({
        ids: [...new Set([...(registry?.ids ?? []), job.id])],
      }));
      return { ids: [...ids.filter((entry) => entry !== job.id), job.id] };
    }
    const jobs = await Promise.all(ids.map(getFilmJob));
    if (
      jobs.filter(
        (item) =>
          item && Date.parse(item.createdAt) >= now.getTime() - 86400000,
      ).length >= dailyLimit
    )
      throw new Error(
        `This collection has reached its ${dailyLimit} film versions per day. Existing films and originals are preserved.`,
      );
    result = await mutateRecord<StoryFilmJob>(job.id, (old) => old ?? job);
    await mutateRecord<Index>(registryKey, (registry) => ({
      ids: [...new Set([...(registry?.ids ?? []), job.id])],
    }));
    return { ids: [...ids, job.id] };
  });
  return result!;
}

/** Retired entry point retained to reject older callers before any provider work. */
export async function enqueueStoryFilms(
  _c: Collection,
  _scriptsApproved: boolean,
  _options: EnqueueOptions & { resolveVoice?: () => Promise<FilmVoice> } = {},
): Promise<StoryFilmJob> {
  throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
}

export async function enqueueOriginalFilms(
  c: Collection,
  planHash: string,
  cutsApproved: boolean,
  allowNoCaptions: boolean,
  options: EnqueueOptions = {},
) {
  if (c.status === "approved")
    throw new Error("Published collections cannot be replaced.");
  const { edit, chapters, snapshots, versionHash } = await prepareOriginalJob(
    c,
    planHash,
    cutsApproved,
    allowNoCaptions,
  );
  const timestamp = (options.now ?? new Date()).toISOString();
  return enqueuePreparedJob(
    {
      schemaVersion: 1,
      kind: "story-film-job",
      mode: "original",
      preparation: "manual",
      id: `film_${versionHash}`,
      collectionId: c.id,
      storytellerName: c.storyteller.name,
      versionHash,
      sourceSha256: edit.storyHash,
      templateVersion: ORIGINAL_TEMPLATE_VERSION,
      status: "queued",
      chapters,
      originalPlanHash: edit.revisionHash,
      originalSources: snapshots,
      cutsApprovedAt: timestamp,
      allowNoCaptions: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      scriptsApprovedAt: timestamp,
      attempts: 0,
    },
    options,
  );
}

export async function enqueueAutomaticOriginalFilms(
  c: Collection,
  options: {
    processingApproved: true;
    presentation?: "video" | "audio";
  } & EnqueueOptions,
) {
  if (options.processingApproved !== true)
    throw new Error(
      "Confirm automatic transcription and editing of your original recordings first.",
    );
  if (c.status === "approved")
    throw new Error("Published collections cannot be replaced.");
  const presentation = options.presentation ?? "video";
  if (!["video", "audio"].includes(presentation))
    throw new Error("Choose video or voice with artwork.");
  const prepared = await prepareAutomaticJob(c, presentation);
  const timestamp = (options.now ?? new Date()).toISOString();
  return enqueuePreparedJob(
    {
      schemaVersion: 1,
      kind: "story-film-job",
      mode: "original",
      preparation: "automatic",
      id: `film_${prepared.versionHash}`,
      collectionId: c.id,
      storytellerName: c.storyteller.name,
      versionHash: prepared.versionHash,
      sourceSha256: prepared.sourceSha256,
      templateVersion: AUTOMATIC_TEMPLATE_VERSION,
      status: "queued",
      chapters: prepared.chapters,
      originalSources: prepared.snapshots,
      automaticPresentation: presentation,
      processingConsentAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      scriptsApprovedAt: timestamp,
      attempts: 0,
    },
    options,
  );
}

export async function filmJobInputsCurrent(job: StoryFilmJob, c: Collection) {
  // Existing finished films remain valid. An unfinished job must never resume
  // with new render code and combine its cached chapters with another template.
  return (
    (job.mode === "original" ||
      job.status === "ready" ||
      filmOutputsAlreadyAttached(job, c)) &&
    (filmTemplateCurrent(job) ||
      job.status === "ready" ||
      filmOutputsAlreadyAttached(job, c)) &&
    filmJobMatches(job, c) &&
    (await originalJobInputsCurrent(job))
  );
}

export async function retryStoryFilms(
  c: Collection,
  id: string,
  scriptsApproved: boolean,
  expectedMode: "ai_narration" | "original" = "original",
) {
  if (expectedMode !== "original")
    throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
  if (!scriptsApproved)
    throw new Error(
      "Confirm processing of your original recordings before retrying.",
    );
  await getFilmJob(id);
  const result = await mutateRecord<StoryFilmJob>(id, async (job) => {
    if (!job || job.collectionId !== c.id)
      throw new Error("Film job not found.");
    if (job.mode !== "original") throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
    if (job.mode !== expectedMode)
      throw new Error("Choose the matching film retry option.");
    if (job.status === "failed" && !filmTemplateCurrent(job))
      return staleTemplateJob(job);
    if (
      c.status === "approved" ||
      !(await filmJobInputsCurrent(job, c)) ||
      (await latestFilmJob(c.id))?.id !== job.id
    )
      throw new Error(
        "These film scripts are out of date. Generate films from the current reviewed stories.",
      );
    if (job.status !== "failed")
      throw new Error("Only a failed film job can be retried.");
    if (job.attempts >= 3)
      throw new Error(
        "This film job needs an operator check after three attempts. Completed work is preserved.",
      );
    return {
      ...job,
      status: "queued",
      error: undefined,
      nextAttemptAt: undefined,
      lease: undefined,
      updatedAt: nowIso(),
      chapters: job.chapters.map((chapter) =>
        chapter.status === "ready"
          ? chapter
          : { ...chapter, status: "queued", error: undefined, progress: 0 },
      ),
    };
  });
  if (result.status === "stale" && !filmTemplateCurrent(result))
    throw new Error(outdatedTemplateMessage);
  return result;
}

export async function claimNextFilmJob(
  workerId: string,
  now = Date.now(),
  onlyId?: string,
  beforeClaim?: (job: StoryFilmJob) => Promise<boolean | void>,
) {
  const registry = await readRecord<Index>(registryKey);
  for (const id of registry?.ids ?? []) {
    if (onlyId && id !== onlyId) continue;
    const snapshot = await getFilmJob(id);
    if (
      !snapshot ||
      ![
        "queued",
        "transcribing",
        "matching",
        "preparing",
        "narrating",
        "rendering",
      ].includes(snapshot.status)
    )
      continue;
    let claimed: StoryFilmJob | null = null;
    await mutateRecord<StoryFilmJob>(id, async (job) => {
      if (!job) throw new Error("Film job not found.");
      if (job.mode !== "original") {
        return { ...retiredNarrationJob(job), updatedAt: nowIso() };
      }
      if (
        [
          "transcribing",
          "matching",
          "preparing",
          "narrating",
          "rendering",
        ].includes(job.status) &&
        job.lease &&
        job.lease.expiresAt <= now
      ) {
        const completed = await getCollection(job.collectionId);
        // Attachment and final job status are separate records. Recover a crash
        // between them without generating or replacing any media.
        if (
          completed &&
          (await filmJobInputsCurrent(job, completed)) &&
          filmOutputsAlreadyAttached(job, completed)
        ) {
          return {
            ...job,
            status: "ready",
            lease: undefined,
            error: undefined,
            updatedAt: nowIso(),
          };
        }
        if (!filmTemplateCurrent(job)) return staleTemplateJob(job);
        if (job.mode === "original" && job.attempts < 3)
          return {
            ...job,
            status: "queued",
            lease: undefined,
            nextAttemptAt: new Date(now + 30000).toISOString(),
            updatedAt: nowIso(),
            error:
              "The source worker stopped. Saved work will resume automatically.",
          };
        return {
          ...job,
          status: "failed",
          lease: undefined,
          updatedAt: nowIso(),
          error:
            "The worker stopped before finishing. Completed files are preserved. Retry after checking the worker; an unfinished narration request may already have been processed.",
        };
      }
      if (
        job.status !== "queued" ||
        (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now) ||
        (job.lease && job.lease.expiresAt > now)
      )
        return job;
      if (!filmTemplateCurrent(job)) return staleTemplateJob(job);
      const c = await getCollection(job.collectionId);
      if (
        !c ||
        c.status === "approved" ||
        !(await filmJobInputsCurrent(job, c)) ||
        (await latestFilmJob(job.collectionId))?.id !== job.id
      )
        return {
          ...job,
          status: "stale",
          updatedAt: nowIso(),
          error:
            "The stories changed before these films started. Generate a new reviewed version.",
        };
      // Capacity checks run under this job's claim lock. A skip leaves the
      // queued record and attempt count untouched, allowing smaller jobs next.
      if ((await beforeClaim?.(job)) === false) return job;
      claimed = {
        ...job,
        status: "preparing",
        attempts: job.attempts + 1,
        nextAttemptAt: undefined,
        error: undefined,
        lease: {
          token: `${workerId}:${randomUUID()}`,
          expiresAt: now + FILM_LEASE_MS,
        },
        updatedAt: nowIso(),
      };
      return claimed;
    });
    if (claimed) return claimed as StoryFilmJob;
  }
  return null;
}

export async function updateFilmJob(
  id: string,
  token: string,
  update: (job: StoryFilmJob) => StoryFilmJob,
) {
  return mutateRecord<StoryFilmJob>(id, (job) => {
    if (!job || job.lease?.token !== token || job.lease.expiresAt <= Date.now())
      throw new Error(
        "The film worker lease expired. This worker cannot publish progress or outputs.",
      );
    const next = update(job);
    return {
      ...next,
      updatedAt: nowIso(),
      lease: next.lease
        ? { token, expiresAt: Date.now() + FILM_LEASE_MS }
        : undefined,
    };
  });
}

export async function attachReadyFilms(job: StoryFilmJob) {
  if (
    job.chapters.length !== 4 ||
    job.chapters.some((chapter) => !chapter.artifact)
  )
    throw new Error("All four films must finish before attachment.");
  return mutateCollection(job.collectionId, async (c) => {
    const latest = await getFilmJob(job.id);
    if ((await latestFilmJob(job.collectionId))?.id !== job.id)
      throw new Error(
        "A newer film version replaced this job. Completed files are preserved.",
      );
    if (
      !latest ||
      (latest.status !== "ready" &&
        (!job.lease ||
          latest.lease?.token !== job.lease.token ||
          latest.lease.expiresAt <= Date.now()))
    )
      throw new Error("The film worker no longer owns this job.");
    if (!(await filmJobInputsCurrent(job, c)))
      throw new Error(
        "The stories changed while rendering. Completed films are preserved but have not been shared.",
      );
    if (
      job.chapters.every(
        (chapter) =>
          c.chapters.find((entry) => entry.id === chapter.chapterId)?.film
            ?.outputSha256 === chapter.artifact!.outputSha256,
      )
    )
      return c;
    if (c.status === "approved" || !filmJobMatches(job, c))
      throw new Error(
        "The stories changed while rendering. Completed films are preserved but have not been shared.",
      );
    if (job.mode !== "original") throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
    for (const chapter of job.chapters) {
      const artifact = chapter.artifact!;
      if (artifact.narrationKind !== "original_recording") {
        throw new Error(RECORDING_ONLY_FILMS_MESSAGE);
      }
      const media = await getMedia(artifact.mediaId);
      if (
        !media ||
        media.collectionId !== c.id ||
        media.role !== "owner" ||
        media.mimeType !== "video/mp4"
      )
        throw new Error("A finished film is missing private storage.");
    }
    for (const chapter of job.chapters) {
      const target = c.chapters.find(
        (entry) => entry.id === chapter.chapterId,
      )!;
      await preserveGeneratedFilmProvenance(c.id, target, getMedia, putMedia);
      target.videoMediaId = chapter.artifact!.mediaId;
      target.videoStatus = "ready";
      target.editorialReviewed = false;
      target.reviewedFilmSha256 = undefined;
      target.film = chapter.artifact;
    }
    queueFilmsReady(c, job.id);
    return c;
  });
}

const workerKey = "story-film-worker-heartbeat";
export async function writeWorkerHeartbeat(workerId: string) {
  await mutateRecord<{ workerId: string; at: number }>(workerKey, () => ({
    workerId,
    at: Date.now(),
  }));
}
export async function filmWorkerHealthy(now = Date.now()) {
  const heartbeat = await readRecord<{ at: number }>(workerKey);
  return Boolean(
    heartbeat && now - heartbeat.at < 90000 && heartbeat.at <= now + 1000,
  );
}

/** An expired owner may report failure, but can never attach or renew outputs. */
export async function failFilmJob(
  id: string,
  token: string,
  message: string,
  stale: boolean,
  retryable = false,
) {
  return mutateRecord<StoryFilmJob>(id, (job) => {
    if (!job || job.lease?.token !== token)
      throw new Error("Another worker owns this job.");
    const retry =
      !stale && retryable && job.mode === "original" && job.attempts < 3;
    return {
      ...job,
      status: stale ? "stale" : retry ? "queued" : "failed",
      nextAttemptAt: retry
        ? new Date(Date.now() + 30000 * 2 ** (job.attempts - 1)).toISOString()
        : undefined,
      error: message,
      lease: undefined,
      updatedAt: nowIso(),
      chapters: job.chapters.map((chapter) =>
        [
          "transcribing",
          "matching",
          "preparing",
          "narrating",
          "rendering",
        ].includes(chapter.status)
          ? {
              ...chapter,
              status: stale ? "stale" : retry ? "queued" : "failed",
              error: message,
            }
          : chapter,
      ),
    };
  });
}
