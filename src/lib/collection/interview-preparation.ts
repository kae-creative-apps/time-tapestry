import {
  isMeaningfulInterviewSpeech,
  interviewSessionNeedsTranscriptRecovery,
} from "./interview-speech";
import { commitInterviewReplacement } from "./interview";
import { playbackReady } from "./playback";
import { createHash, randomUUID } from "node:crypto";
import { CHAPTERS } from "../interview-state";
import { reserveProviderBudget } from "../security/request";
import {
  getCollection,
  getMedia,
  mutateCollection,
  mutateRecord,
  readRecord,
} from "./store";
import { draftChapters, selectedAnswers } from "./content";
import {
  hasRecordedAnswerSource,
  isStoredOwnerRecording,
} from "./recording-validation";
import {
  enqueueAutomaticOriginalFilms,
  automaticFilmTemplateCurrent,
  filmJobInputsCurrent,
  getFilmJob,
  retryStoryFilms,
  attachReadyFilms,
} from "./films/jobstore";
import { queuePreparationAttention } from "./recovery-notifications";
import type { ChapterPackage, Collection, StoredMedia } from "./types";
import type {
  InterviewPreparationJob,
  InterviewPreparationView,
} from "./interview-preparation-types";

const registryKey = "interview-preparation-registry";
type Registry = { ids: string[] };
export const INTERVIEW_PREPARATION_LEASE_MS = 120_000;
const MAX_ATTEMPTS = 3;
const iso = () => new Date().toISOString();
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class InterviewPreparationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function interviewPreparationJobView(
  job: InterviewPreparationJob,
): InterviewPreparationView {
  return {
    id: job.id,
    status: job.status,
    submittedAt: job.submittedAt,
    updatedAt: job.updatedAt,
    processingApprovedAt: job.processingApprovedAt,
    ...(job.filmJobId ? { filmJobId: job.filmJobId } : {}),
    ...(job.missingAreas ? { missingAreas: job.missingAreas } : {}),
    ...(job.error ? { error: job.error } : {}),
    ready: false,
    canRetry:
      job.status === "needs_attention" &&
      job.attempts < MAX_ATTEMPTS &&
      !job.missingAreas?.length,
    ...(job.nextAttemptAt ? { retryAfter: job.nextAttemptAt } : {}),
  };
}

export function getInterviewPreparationJob(id: string) {
  if (!/^prep_[a-f0-9]{64}$/.test(id))
    throw new InterviewPreparationError("Preparation could not be found.");
  return readRecord<InterviewPreparationJob>(id);
}

/** Metadata identity here; the original-film pipeline separately hashes file bytes. */
async function snapshotInputs(c: Collection) {
  const takes = c.takes
    .filter((take) => c.selectedTakeIds[take.questionId] === take.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const interviews = (c.interviews ?? [])
    .map((session) => ({
      id: session.id,
      provider: session.provider,
      providerConversationId: session.providerConversationId,
      providerConversationIds: session.providerConversationIds,
      startedAt: session.startedAt,
      replacesChapterId: session.replacesChapterId,
      replacementCommittedAt: session.replacementCommittedAt,
      segments: [...session.segments].sort((a, b) => a.id.localeCompare(b.id)),
      excludedTurnIds: [...session.excludedTurnIds].sort(),
      turns: [...session.turns].sort((a, b) => a.sequence - b.sequence),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set<string>();
  for (const take of takes) {
    if (take.kind === "text") continue;
    if (!(await hasRecordedAnswerSource(take, c, getMedia)))
      throw new InterviewPreparationError(
        "Finish saving your original recording before submitting. Your saved words are unchanged.",
      );
    for (const id of take.liveSource?.sourceRanges.map(
      (range) => range.mediaId,
    ) ?? (take.mediaId ? [take.mediaId] : []))
      ids.add(id);
    if (take.audioMediaId) ids.add(take.audioMediaId);
  }
  for (const session of interviews)
    for (const segment of session.segments) {
      ids.add(segment.mediaId);
      if (segment.audioMediaId) ids.add(segment.audioMediaId);
    }
  const media: StoredMedia[] = [];
  for (const id of [...ids].sort()) {
    const stored = await getMedia(id);
    if (!isStoredOwnerRecording(stored, c))
      throw new InterviewPreparationError(
        "Finish saving your original recording before submitting. Your local recording is still available.",
      );
    media.push(stored);
  }
  if (!media.length)
    throw new InterviewPreparationError(
      "Save an original audio or video recording before submitting your conversation.",
    );
  const mediaIdentity = media.map(
    ({
      id,
      collectionId,
      role,
      mimeType,
      bytes,
      url,
      localPath,
      provenance,
    }) => ({
      id,
      collectionId,
      role,
      mimeType,
      bytes,
      url,
      localPath,
      provenance,
    }),
  );
  const selection = Object.fromEntries(
    Object.entries(c.selectedTakeIds).sort(([a], [b]) => a.localeCompare(b)),
  );
  const explicit = Object.fromEntries(
    Object.entries(c.explicitTakeSelections ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  const originalInputs = {
    collectionId: c.id,
    faithFraming: c.faithFraming,
    selection,
    explicit,
    takes,
    interviews,
    media: mediaIdentity,
  };
  const recordingInputs = {
    selection,
    explicit,
    takes: takes.map(({ text, prompt, ...take }) => {
      void text;
      void prompt;
      return take;
    }),
    interviews: interviews.map(({ turns, ...session }) => {
      void turns;
      return session;
    }),
    media: mediaIdentity,
  };
  return {
    sourceSha256: sha(originalInputs),
    recordingSha256: sha(recordingInputs),
    originalInputs,
    originalMedia: structuredClone(media),
  };
}

export async function enqueueInterviewPreparation(
  collectionId: string,
  options: {
    processingApproved: true;
    retry?: boolean;
    authorize?: (c: Collection) => Promise<void>;
  },
) {
  if (options.processingApproved !== true)
    throw new InterviewPreparationError(
      "Confirm processing of your original recordings before submitting.",
    );
  let queued: InterviewPreparationJob | undefined;
  const collection = await mutateCollection(collectionId, async (c) => {
    await options.authorize?.(c);
    if (c.status === "approved")
      throw new InterviewPreparationError(
        "Approved stories cannot be replaced.",
        409,
      );
    const inputs = await snapshotInputs(c);
    const previous = c.interviewPreparation
      ? await getInterviewPreparationJob(c.interviewPreparation.id)
      : null;
    const matches =
      previous &&
      [
        previous.sourceSha256,
        previous.reconciledSourceSha256,
        previous.recoveryInputSha256,
      ].includes(inputs.sourceSha256);
    const id = matches
      ? previous.id
      : `prep_${sha({ version: 1, ...inputs, originalMedia: undefined })}`;
    queued = await mutateRecord<InterviewPreparationJob>(
      id,
      async (existing) => {
        if (existing) {
          if (existing.collectionId !== collectionId)
            throw new InterviewPreparationError(
              "Preparation identity mismatch.",
            );
          const linkedFilm = existing.filmJobId
            ? await getFilmJob(existing.filmJobId)
            : null;
          // A newer edit template must be allowed to run once. Earlier attempts
          // failed against the previous matcher and do not count against it.
          const staleAutomaticFilm = Boolean(
            linkedFilm &&
            linkedFilm.mode === "original" &&
            linkedFilm.preparation === "automatic" &&
            linkedFilm.status !== "ready" &&
            !automaticFilmTemplateCurrent(linkedFilm),
          );
          if (
            options.retry &&
            existing.status === "needs_attention" &&
            existing.attempts >= MAX_ATTEMPTS &&
            !staleAutomaticFilm
          )
            throw new InterviewPreparationError(
              "Preparation stopped after three attempts. Please contact the Time Tapestry team using your private collection link. Your recordings and completed work are saved.",
              409,
            );
          const reviewingFilms =
            options.retry &&
            Boolean(existing.filmJobId) &&
            (existing.status === "films_queued" ||
              (existing.status === "needs_attention" && staleAutomaticFilm));
          const failedFilms = reviewingFilms ? linkedFilm : null;
          const retryFilms =
            reviewingFilms &&
            (!failedFilms ||
              ["failed", "stale"].includes(failedFilms.status) ||
              !(await filmJobInputsCurrent(failedFilms, c)));
          if (
            retryFilms &&
            failedFilms?.status === "failed" &&
            failedFilms.attempts >= MAX_ATTEMPTS &&
            automaticFilmTemplateCurrent(failedFilms)
          )
            throw new InterviewPreparationError(
              "Film preparation stopped after three attempts. Please contact the Time Tapestry team using your private collection link. Completed films and recordings are saved.",
              409,
            );
          if (
            options.retry &&
            ((existing.status === "needs_attention" &&
              existing.attempts < MAX_ATTEMPTS) ||
              retryFilms)
          )
            return {
              ...existing,
              status: "queued",
              ...(retryFilms ? { attempts: 0 } : {}),
              ...(existing.missingAreas?.length
                ? {
                    recoveredInterviews: undefined,
                    recoveredSelectedTakeIds: undefined,
                    drafts: undefined,
                    recoveryInputSha256: inputs.sourceSha256,
                  }
                : {}),
              error: undefined,
              missingAreas: undefined,
              lease: undefined,
              nextAttemptAt: undefined,
              updatedAt: iso(),
            };
          return existing;
        }
        const timestamp = iso();
        return {
          schemaVersion: 1,
          recordType: "interview-preparation-job",
          id,
          collectionId,
          status: "queued",
          ...inputs,
          submittedAt: timestamp,
          updatedAt: timestamp,
          processingApprovedAt: timestamp,
          attempts: 0,
        };
      },
    );
    c.interviewPreparation = interviewPreparationJobView(queued);
    // A previous draft-ready notice must not race this unfinished film version.
    // Matching retries may follow a crash after film enqueue but before its ID
    // was checkpointed here. Do not delete a ready notice during that gap.
    if (!matches)
      c.notifications = c.notifications.filter(
        (notice) =>
          notice.kind !== "review_ready" || notice.status !== "pending",
      );
    return c;
  });
  // The registry is published after the collection. A retry repairs membership
  // if the process stopped between these two durable saves.
  await mutateRecord<Registry>(registryKey, (registry) => ({
    ids: [...new Set([...(registry?.ids ?? []), queued!.id])],
  }));
  return { collection, preparation: interviewPreparationJobView(queued!) };
}

async function publishStatus(job: InterviewPreparationJob) {
  return mutateRecord<Collection>(job.collectionId, (c) => {
    if (!c)
      throw new InterviewPreparationError("Your stories could not be found.");
    if (c.status === "approved" || c.interviewPreparation?.id !== job.id)
      return c;
    c.interviewPreparation = interviewPreparationJobView(job);
    if (job.status === "needs_attention")
      queuePreparationAttention(c, job.id, job.error, job.updatedAt);
    c.updatedAt = iso();
    return c;
  });
}

export async function claimInterviewPreparation(
  workerId: string,
  now = Date.now(),
  onlyId?: string,
) {
  const registry = await readRecord<Registry>(registryKey);
  for (const id of registry?.ids ?? []) {
    if (onlyId && onlyId !== id) continue;
    let claimed: InterviewPreparationJob | null = null;
    const result = await mutateRecord<InterviewPreparationJob>(id, (job) => {
      if (!job)
        throw new InterviewPreparationError("Preparation could not be found.");
      if (
        !["queued", "preparing"].includes(job.status) ||
        (job.lease && job.lease.expiresAt > now) ||
        (job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now)
      )
        return job;
      if (job.attempts >= MAX_ATTEMPTS)
        return {
          ...job,
          status: "needs_attention",
          lease: undefined,
          updatedAt: iso(),
          error:
            "Preparation needs a setup check after three attempts. Your original recordings and saved progress are preserved.",
        };
      claimed = {
        ...job,
        status: "preparing",
        attempts: job.attempts + 1,
        lease: {
          token: `${workerId}:${randomUUID()}`,
          expiresAt: now + INTERVIEW_PREPARATION_LEASE_MS,
        },
        nextAttemptAt: undefined,
        error: undefined,
        updatedAt: iso(),
      };
      return claimed;
    });
    if (result.status === "needs_attention") await publishStatus(result);
    if (claimed) {
      await publishStatus(claimed);
      return claimed as InterviewPreparationJob;
    }
  }
  return null;
}

export async function updateInterviewPreparationJob(
  id: string,
  token: string,
  update: (job: InterviewPreparationJob) => InterviewPreparationJob,
) {
  return mutateRecord<InterviewPreparationJob>(id, (job) => {
    if (!job || job.lease?.token !== token || job.lease.expiresAt <= Date.now())
      throw new InterviewPreparationError(
        "Preparation worker lease expired.",
        409,
      );
    const next = update(job);
    return {
      ...next,
      updatedAt: iso(),
      lease: next.lease
        ? { token, expiresAt: Date.now() + INTERVIEW_PREPARATION_LEASE_MS }
        : undefined,
    };
  });
}

async function currentInputs(
  job: InterviewPreparationJob,
  current?: Collection,
) {
  const savedJob = await getInterviewPreparationJob(job.id);
  if (
    !job.lease ||
    savedJob?.lease?.token !== job.lease.token ||
    savedJob.lease.expiresAt <= Date.now()
  )
    throw new InterviewPreparationError(
      "Preparation worker lease expired.",
      409,
    );
  const c = current ?? (await getCollection(job.collectionId));
  if (!c || c.status === "approved" || c.interviewPreparation?.id !== job.id)
    throw new InterviewPreparationError(
      "This preparation was replaced or its collection was approved. Saved originals are preserved.",
      409,
    );
  const inputs = await snapshotInputs(c);
  if (
    ![
      job.sourceSha256,
      job.reconciledSourceSha256,
      job.recoveryInputSha256,
    ].includes(inputs.sourceSha256)
  )
    throw new InterviewPreparationError(
      "Your answers changed after submission. Submit your latest saved recordings to prepare a new version.",
      409,
    );
  return { c, inputs };
}

type WorkerOptions = {
  shouldStop?: () => boolean;
  onlyId?: string;
  reconcile?: (c: Collection) => Promise<Collection>;
  recoverOriginal?: (c: Collection) => Promise<Collection>;
  draft?: (c: Collection) => Promise<ChapterPackage[]>;
  enqueueFilms?: (
    c: Collection,
    options: { processingApproved: true; outputMode?: "interactive" | "mp4" },
  ) => Promise<{ id: string }>;
  reserveDraftBudget?: () => Promise<void>;
};

export async function runInterviewPreparationOnce(
  workerId: string,
  options: WorkerOptions = {},
) {
  if (options.shouldStop?.()) return null;
  let job = await claimInterviewPreparation(
    workerId,
    Date.now(),
    options.onlyId,
  );
  if (!job) return null;
  const token = job.lease!.token;
  let leaseLost = false;
  let workStarted = false;
  let heartbeatWrite = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatWrite = heartbeatWrite
      .then(async () => {
        await updateInterviewPreparationJob(job!.id, token, (saved) => saved);
      })
      .catch(() => {
        leaseLost = true;
      });
  }, 30_000);
  const checkpoint = async (
    update: (saved: InterviewPreparationJob) => InterviewPreparationJob,
  ) => {
    if (leaseLost)
      throw new InterviewPreparationError(
        "Preparation worker lease expired.",
        409,
      );
    job = await updateInterviewPreparationJob(job!.id, token, update);
    return job;
  };
  try {
    if (options.shouldStop?.()) throw new Error("Worker stopping");
    let { c } = await currentInputs(job);
    if (!job.recoveredInterviews) {
      const reconcile =
        options.reconcile ??
        (async (current: Collection) => {
          const { reconcileRecordedInterview } =
            await import("./interview-reconciliation");
          return reconcileRecordedInterview(current, {
            assertCurrent: async () => {
              await currentInputs(job!);
            },
          });
        });
      if (options.shouldStop?.()) throw new Error("Worker stopping");
      workStarted = true;
      let recovered = await reconcile(structuredClone(c));
      if (
        recovered.interviews?.some(interviewSessionNeedsTranscriptRecovery) &&
        (options.recoverOriginal || process.env.ELEVENLABS_API_KEY?.trim())
      ) {
        const { recoverOriginalInterviewSpeech, InterviewSourceRecoveryError } =
          await import("./interview-source-recovery");
        try {
          recovered = await (
            options.recoverOriginal ??
            ((current: Collection) =>
              recoverOriginalInterviewSpeech(current, {
                processingApprovedAt: job!.processingApprovedAt,
                jobId: job!.id,
                attempt: job!.attempts,
                originalMedia: job!.originalMedia,
                assertCurrent: async () => {
                  await currentInputs(job!);
                },
              }))
          )(recovered);
        } catch (error) {
          if (error instanceof InterviewSourceRecoveryError)
            throw new InterviewPreparationError(error.message);
          throw error;
        }
      }
      await currentInputs(job);
      for (const session of c.interviews ?? []) {
        const recoveredSession = recovered.interviews?.find(
          (item) => item.id === session.id,
        );
        for (const raw of session.turns) {
          const preserved = recoveredSession?.turns.find(
            (turn) => turn.id === raw.id,
          );
          const protectedFields = (turn: typeof raw) => ({
            id: turn.id,
            role: turn.role,
            text: turn.text,
            capturedAt: turn.capturedAt,
            startMs: turn.startMs,
            endMs: turn.endMs,
            timing: turn.timing,
            supersedesTurnId: turn.supersedesTurnId,
          });
          if (
            !preserved ||
            sha(protectedFields(preserved)) !== sha(protectedFields(raw))
          )
            throw new InterviewPreparationError(
              "Transcript recovery could not preserve the saved words. Your original recording and saved answers are unchanged.",
              409,
            );
        }
      }
      const recoveredInputs = await snapshotInputs(recovered);
      const recoveryInputSha256 = (await snapshotInputs(c)).sourceSha256;
      if (recoveredInputs.recordingSha256 !== job.recordingSha256)
        throw new InterviewPreparationError(
          "The saved originals changed during recovery. Submit your latest recording.",
          409,
        );
      for (const session of recovered.interviews ?? [])
        await commitInterviewReplacement(recovered, session, getMedia);
      const committedInputs = await snapshotInputs(recovered);
      await checkpoint((saved) => ({
        ...saved,
        recoveredInterviews: structuredClone(recovered.interviews ?? []),
        recoveredSelectedTakeIds: { ...recovered.selectedTakeIds },
        recoveryInputSha256,
        recordingSha256: committedInputs.recordingSha256,
        reconciledSourceSha256: committedInputs.sourceSha256,
      }));
    }
    if (options.shouldStop?.()) throw new Error("Worker stopping");
    workStarted = true;
    c = await mutateCollection(job.collectionId, async (current) => {
      await currentInputs(job!, current);
      const committedBefore = new Set(
        (current.interviews ?? [])
          .filter((session) => session.replacementCommittedAt)
          .map((session) => session.id),
      );
      current.interviews = structuredClone(job!.recoveredInterviews!);
      if (job!.recoveredSelectedTakeIds)
        current.selectedTakeIds = { ...job!.recoveredSelectedTakeIds };
      if (
        current.interviews.some(
          (session) =>
            session.replacementCommittedAt && !committedBefore.has(session.id),
        )
      ) {
        current.status = "recording";
        if (current.chapters.length) current.draftOutdated = true;
        for (const chapter of current.chapters) {
          chapter.editorialReviewed = false;
          chapter.reviewedFilmSha256 = undefined;
        }
      }
      return current;
    });
    const missingAreas: NonNullable<InterviewPreparationView["missingAreas"]> =
      [];
    for (const chapter of CHAPTERS) {
      const answers = selectedAnswers(c, chapter.id);
      let complete = answers.length > 0;
      for (const answer of answers)
        if (
          !isMeaningfulInterviewSpeech(answer.text) ||
          !(await hasRecordedAnswerSource(answer, c, getMedia))
        )
          complete = false;
      if (!complete)
        missingAreas.push({ id: chapter.id, title: chapter.title });
    }
    if (missingAreas.length) {
      await checkpoint((saved) => ({
        ...saved,
        status: "needs_attention",
        lease: undefined,
        missingAreas,
        error: `Saved words and original recordings are still needed for: ${missingAreas.map((area) => area.title).join(", ")}. Your completed recordings are preserved.`,
      }));
      await publishStatus(job);
      return job;
    }
    if (!job.drafts) {
      await currentInputs(job);
      if (options.shouldStop?.()) throw new Error("Worker stopping");
      if (process.env.GLOO_API_KEY?.trim())
        await (
          options.reserveDraftBudget ??
          (() => reserveProviderBudget("generate"))
        )();
      const drafts = await (options.draft ?? draftChapters)(c);
      if (
        drafts.length !== 4 ||
        CHAPTERS.some(
          ({ id }) =>
            !drafts.some(
              (chapter) =>
                chapter.id === id &&
                chapter.content.trim() &&
                chapter.postcardNote.trim(),
            ),
        )
      )
        throw new InterviewPreparationError(
          "All four written stories and postcard drafts need to finish before preparing films.",
        );
      await currentInputs(job);
      await checkpoint((saved) => ({
        ...saved,
        drafts: structuredClone(drafts),
      }));
    }
    c = await mutateCollection(job.collectionId, async (current) => {
      await currentInputs(job!, current);
      // Film attachment and editorial review happen after this cached checkpoint.
      // Compare only the written draft, never erase completed attachments on resume.
      const draftIdentity = (chapters: ChapterPackage[]) =>
        chapters.map(
          ({
            id,
            title,
            content,
            postcardNote,
            sourceTakeIds,
            generatedWith,
          }) => ({
            id,
            title,
            content,
            postcardNote,
            sourceTakeIds,
            generatedWith,
          }),
        );
      const sameDraft =
        sha(draftIdentity(current.chapters)) ===
        sha(draftIdentity(job!.drafts!));
      if (!sameDraft) {
        if (current.chapters.length)
          current.draftHistory = [
            ...(current.draftHistory ?? []),
            {
              savedAt: iso(),
              chapters: structuredClone(current.chapters),
              chapterBlessings: structuredClone(current.chapterBlessings),
            },
          ];
        current.chapters = structuredClone(job!.drafts!);
      }
      current.status = "draft";
      current.draftOutdated = false;
      return current;
    });
    await currentInputs(job);
    if (options.shouldStop?.()) throw new Error("Worker stopping");
    let filmJob = await (options.enqueueFilms ?? enqueueAutomaticOriginalFilms)(
      c,
      { processingApproved: true, outputMode: "interactive" },
    );
    if ("status" in filmJob && filmJob.status === "failed") {
      try {
        filmJob = await retryStoryFilms(c, filmJob.id, true, "original");
      } catch {
        throw new InterviewPreparationError(
          "Film preparation needs a setup check. Completed films, written stories and original recordings are preserved.",
        );
      }
    }
    if ("status" in filmJob && filmJob.status === "stale")
      throw new InterviewPreparationError(
        "This film version is out of date. Your written stories and original recordings are saved; a setup check is needed before retrying.",
      );
    if ("status" in filmJob && filmJob.status === "ready") {
      const readyJob = await getFilmJob(filmJob.id);
      if (!readyJob) throw new Error("The saved film job could not be found.");
      await attachReadyFilms(readyJob);
    }
    await checkpoint((saved) => ({
      ...saved,
      status: "films_queued",
      filmJobId: filmJob.id,
      lease: undefined,
      error: undefined,
      missingAreas: undefined,
    }));
    await publishStatus(job);
    return job;
  } catch (error) {
    try {
      if (!workStarted && options.shouldStop?.()) {
        await checkpoint((saved) => ({
          ...saved,
          status: "queued",
          attempts: Math.max(0, saved.attempts - 1),
          lease: undefined,
          nextAttemptAt: undefined,
          error: undefined,
        }));
        await publishStatus(job);
        return job;
      }
      await checkpoint((saved) => ({
        ...saved,
        status:
          error instanceof InterviewPreparationError ||
          saved.attempts >= MAX_ATTEMPTS
            ? "needs_attention"
            : "queued",
        nextAttemptAt:
          error instanceof InterviewPreparationError ||
          saved.attempts >= MAX_ATTEMPTS
            ? undefined
            : new Date(Date.now() + 30_000).toISOString(),
        lease: undefined,
        error:
          error instanceof InterviewPreparationError
            ? error.message
            : saved.attempts >= MAX_ATTEMPTS
              ? "Preparation stopped after three attempts. Your original recordings and saved progress are preserved. Please contact the Time Tapestry team using your private collection link."
              : "Preparation could not finish yet. Your original recordings and saved progress are preserved; it will retry automatically.",
      }));
      await publishStatus(job);
      return job;
    } catch {
      // A replaced or expired worker cannot publish failure over its successor.
      return await getInterviewPreparationJob(job.id);
    }
  } finally {
    clearInterval(heartbeat);
    await heartbeatWrite;
  }
}

export async function getInterviewPreparationView(c: Collection) {
  if (!c.interviewPreparation) return null;
  const job = await getInterviewPreparationJob(c.interviewPreparation.id);
  if (!job || job.collectionId !== c.id) return null;
  const view = interviewPreparationJobView(job);
  if (!job.filmJobId) return view;
  const films = await getFilmJob(job.filmJobId);
  if (!films || !(await filmJobInputsCurrent(films, c))) {
    const updatedEdit = Boolean(
      films &&
      films.mode === "original" &&
      films.preparation === "automatic" &&
      films.status !== "ready" &&
      !automaticFilmTemplateCurrent(films),
    );
    return {
      ...view,
      status: "needs_attention" as const,
      canRetry: true,
      error: updatedEdit
        ? "Film preparation can use an updated edit of your saved interview. Your written stories and original recordings are kept."
        : "The recorded film version is out of date. Submit your latest recordings to prepare a new version.",
    };
  }
  if (films.status === "failed" || films.status === "stale")
    return {
      ...view,
      status: "needs_attention" as const,
      canRetry: films.status === "failed" && films.attempts < MAX_ATTEMPTS,
      error:
        films.attempts >= MAX_ATTEMPTS
          ? "Film preparation stopped after three attempts. Please contact the Time Tapestry team using your private collection link. Your stories and recordings are saved."
          : "Film preparation needs attention. Your written stories and original recordings are saved.",
    };
  if (films.outputMode === "interactive") {
    view.ready = await playbackReady(c, films);
    return view;
  }
  view.ready =
    films.status === "ready" &&
    c.chapters.length === 4 &&
    CHAPTERS.every(({ id }) => {
      const chapter = c.chapters.find((item) => item.id === id);
      const completed = films.chapters.find((item) => item.chapterId === id);
      return (
        chapter?.videoStatus === "ready" &&
        chapter.film?.narrationKind === "original_recording" &&
        completed?.status === "ready" &&
        completed.artifact?.narrationKind === "original_recording" &&
        chapter.film.jobId === films.id &&
        chapter.videoMediaId === completed.artifact.mediaId &&
        chapter.film.outputSha256 === completed.artifact.outputSha256
      );
    });
  if (view.ready)
    for (const chapter of c.chapters) {
      const media =
        chapter.videoMediaId && (await getMedia(chapter.videoMediaId));
      if (
        !media ||
        media.collectionId !== c.id ||
        media.role !== "owner" ||
        !media.mimeType.startsWith("video/") ||
        media.bytes <= 0 ||
        !(media.localPath || media.url)
      )
        view.ready = false;
    }
  return view;
}
