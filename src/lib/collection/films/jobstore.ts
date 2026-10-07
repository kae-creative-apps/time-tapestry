import { sha256 } from "./plan";
import { appOrigin, linksFor } from "../access";
import {
  playbackJobMatchesCollection,
  attachChapterPlayback,
  playbackReady,
} from "../playback";
import { queueFilmsReady } from "../notifications";
import { queuePreparationAttention } from "../recovery-notifications";
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
const STORY_FILM_DAILY_WINDOW_MS = 86400000;
export const STORY_FILM_DAILY_LIMIT_DEFAULT = 10;
export const STORY_FILM_DAILY_LIMIT_MAX = 25;

/** Versions still in progress or ready. Failed and stale attempts do not burn a slot. */
export function storyFilmDailyLimit(
  override?: number,
  configured = process.env.STORY_FILM_DAILY_LIMIT,
) {
  if (override !== undefined) return override;
  const parsed = Number(configured || STORY_FILM_DAILY_LIMIT_DEFAULT);
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(STORY_FILM_DAILY_LIMIT_MAX, parsed))
    : STORY_FILM_DAILY_LIMIT_DEFAULT;
}

function countsTowardDailyFilmLimit(job: StoryFilmJob | null, now: Date) {
  return (
    !!job &&
    job.status !== "failed" &&
    job.status !== "stale" &&
    Date.parse(job.createdAt) >= now.getTime() - STORY_FILM_DAILY_WINDOW_MS
  );
}

export const getFilmJob = (id: string) => {
  if (!/^film_[a-f0-9]{64}$/.test(id)) throw new Error("Invalid film job.");
  return readRecord<StoryFilmJob>(id);
};

export async function latestFilmJob(collectionId: string) {
  const index = await readRecord<Index>(indexKey(collectionId));
  return index?.ids.length ? getFilmJob(index.ids.at(-1)!) : null;
}

/** These checks use the same cached word timing on every retry. A worker or
 * editor must repair the source evidence before trying that version again. */
function deterministicSourceFailure(job: StoryFilmJob) {
  if (job.preparation !== "automatic") return false;
  const errors = [job.error, ...job.chapters.map((chapter) => chapter.error)]
    .filter(Boolean)
    .join("\n");
  return /selected source word has no verified positive duration|same answer occurs more than once|complete answer boundaries could not be verified|source-word match did not preserve|saved answer could not be matched confidently|overlapping source words need review|short answer needs a verified neighboring answer|short answer could not be verified|recorded answer is too short to match uniquely|answer needs a smaller source search|multiple detected speakers|source transcription cache failed verification/i.test(
    errors,
  );
}

export function filmRetryEligibility(job: StoryFilmJob): {
  retryAllowed: boolean;
  retryBlockedReason?: string;
} {
  if (
    job.status !== "failed" ||
    job.mode !== "original" ||
    !filmTemplateCurrent(job)
  )
    return { retryAllowed: false };
  if (job.attempts >= 3)
    return {
      retryAllowed: false,
      retryBlockedReason:
        "This film job needs an operator check after three attempts. Completed work and original recordings are preserved.",
    };
  if (deterministicSourceFailure(job))
    return {
      retryAllowed: false,
      retryBlockedReason:
        "The saved word timing needs an editor check before these films can be prepared. Your original recordings are preserved. Repeating this attempt will not resolve the timing.",
    };
  return { retryAllowed: true };
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
    attempts: job.attempts,
    ...filmRetryEligibility(job),
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

export function automaticFilmTemplateCurrent(job: StoryFilmJob) {
  return (
    job.mode === "original" &&
    job.preparation === "automatic" &&
    job.templateVersion === AUTOMATIC_TEMPLATE_VERSION
  );
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
  if (job.outputMode === "interactive")
    return (
      job.chapters.length === 4 &&
      job.chapters.every(
        (chapter) =>
          chapter.playback &&
          c.chapters.find((item) => item.id === chapter.chapterId)?.playback
            ?.outputSha256 === chapter.playback.outputSha256,
      )
    );
  if (job.sourceJobId)
    return (
      job.chapters.length === 4 &&
      job.chapters.every(
        (chapter) =>
          chapter.artifact &&
          c.chapters.find((item) => item.id === chapter.chapterId)?.playback
            ?.exportSha256 === chapter.artifact.outputSha256,
      )
    );
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
  const dailyLimit = storyFilmDailyLimit(options.dailyLimit);
  let result: StoryFilmJob | null = null;
  await mutateRecord<Index>(indexKey(job.collectionId), async (index) => {
    const ids = index?.ids ?? [];
    const current = await getCollection(job.collectionId);
    if (
      !current ||
      (current.status === "approved" &&
        !playbackJobMatchesCollection(job, current)) ||
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
      jobs.filter((item) => countsTowardDailyFilmLimit(item, now)).length >=
      dailyLimit
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
    outputMode?: "interactive" | "mp4";
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
      id: `film_${options.outputMode === "interactive" ? sha256(`${prepared.versionHash}:interactive-v1`) : prepared.versionHash}`,
      outputMode: options.outputMode,
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
      (c.status === "approved" && !playbackJobMatchesCollection(job, c)) ||
      !(await filmJobInputsCurrent(job, c)) ||
      (await latestFilmJob(c.id))?.id !== (job.sourceJobId ?? job.id)
    )
      throw new Error(
        "These film scripts are out of date. Generate films from the current reviewed stories.",
      );
    if (job.status !== "failed")
      throw new Error("Only a failed film job can be retried.");
    const eligibility = filmRetryEligibility(job);
    if (!eligibility.retryAllowed)
      throw new Error(
        eligibility.retryBlockedReason ||
          "This film job needs an operator check before another attempt.",
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
    const updated = await mutateRecord<StoryFilmJob>(id, async (job) => {
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
            "Film preparation stopped after repeated interruptions. Completed files and original recordings are preserved. Contact the team before starting another attempt.",
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
        (c.status === "approved" && !playbackJobMatchesCollection(job, c)) ||
        !(await filmJobInputsCurrent(job, c)) ||
        (await latestFilmJob(job.collectionId))?.id !==
          (job.sourceJobId ?? job.id)
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
    if (updated.status === "failed") await publishFilmAttention(updated);
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
  if (job.outputMode === "interactive") return attachChapterPlayback(job);
  if (
    job.chapters.length !== 4 ||
    job.chapters.some((chapter) => !chapter.artifact)
  )
    throw new Error("All four films must finish before attachment.");
  return mutateCollection(job.collectionId, async (c) => {
    const latest = await getFilmJob(job.id);
    if (
      (await latestFilmJob(job.collectionId))?.id !==
      (job.sourceJobId ?? job.id)
    )
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
    if (
      (c.status === "approved" && !playbackJobMatchesCollection(job, c)) ||
      !filmJobMatches(job, c)
    )
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
      if (job.sourceJobId) {
        if (!playbackJobMatchesCollection(job, c) || !target.playback)
          throw new Error("The export does not match these chapters.");
        target.playback.exportMediaId = chapter.artifact!.mediaId;
        target.playback.exportSha256 = chapter.artifact!.outputSha256;
        continue;
      }
      await preserveGeneratedFilmProvenance(c.id, target, getMedia, putMedia);
      target.playback = undefined;
      target.reviewedPlaybackSha256 = undefined;
      target.videoMediaId = chapter.artifact!.mediaId;
      target.videoStatus = "ready";
      target.editorialReviewed = false;
      target.reviewedFilmSha256 = undefined;
      target.film = chapter.artifact;
    }
    if (job.sourceJobId) {
      const id = `${c.id}:export-ready:${job.id}`;
      if (!c.notifications.some((item) => item.id === id))
        c.notifications.push({
          id,
          kind: "review_ready",
          to: c.storyteller.email,
          subject: "Your downloadable Time Tapestry videos are ready",
          text: "Your four videos are ready to download from your private collection. Your original recordings and shared stories are unchanged.",
          url: appOrigin() + linksFor(c).review,
          dueAt: nowIso(),
          status: "pending",
        });
    } else queueFilmsReady(c, job.id);
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
  const failed = await mutateRecord<StoryFilmJob>(id, (job) => {
    if (!job || job.lease?.token !== token)
      throw new Error("Another worker owns this job.");
    const retry =
      !stale &&
      retryable &&
      job.mode === "original" &&
      job.attempts < 3 &&
      !deterministicSourceFailure({ ...job, error: message });
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
  if (failed.status === "failed") await publishFilmAttention(failed);
  return failed;
}

async function publishFilmAttention(job: StoryFilmJob) {
  if (!(await getCollection(job.collectionId))) return;
  await mutateCollection(job.collectionId, async (c) => {
    if (
      (await latestFilmJob(c.id))?.id === job.id &&
      (await filmJobInputsCurrent(job, c))
    )
      queuePreparationAttention(
        c,
        job.id,
        "Film preparation stopped before all four films were ready. Your original recordings, written stories and any completed films are saved.",
      );
    return c;
  });
}

export async function enqueuePlaybackExport(c: Collection) {
  const source = await latestFilmJob(c.id);
  if (!source || !(await playbackReady(c, source)))
    throw new Error("Your chapters are still being prepared.");
  const id = `film_${sha256(`${source.id}:mp4-export-v1`)}`;
  const result = await mutateRecord<StoryFilmJob>(id, (current) => {
    if (current) {
      if (current.collectionId !== c.id || current.sourceJobId !== source.id)
        throw new Error("Export identity mismatch.");
      return current;
    }
    return {
      ...source,
      id,
      sourceJobId: source.id,
      outputMode: "mp4",
      status: "queued",
      attempts: 0,
      lease: undefined,
      error: undefined,
      nextAttemptAt: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      chapters: source.chapters.map((chapter) => ({
        ...chapter,
        artifact: undefined,
        status: "queued",
        progress: 0,
      })),
    };
  });
  await mutateRecord<Index>(registryKey, (registry) => ({
    ids: [...new Set([...(registry?.ids ?? []), id])],
  }));
  return result;
}
