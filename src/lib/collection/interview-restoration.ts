import { createHash } from "node:crypto";
import { CHAPTERS } from "../interview-state";
import { SecurityError } from "../security/policy";
import { interviewAnswers } from "./interview";
import {
  hasRecordedAnswerSource,
  isStoredOwnerRecording,
} from "./recording-validation";
import { getMedia, mutateCollection, mutateRecord } from "./store";
import type { Collection, InterviewSession, StoredMedia } from "./types";

/** Keep this source-choice action independent from rendering/provider imports. */
export class InterviewRestorationError extends SecurityError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Private, append-only source-choice backup. Never attached to a Collection view. */
export type InterviewRestorationAudit = {
  schemaVersion: 1;
  recordType: "interview-source-restoration";
  id: string;
  collectionId: string;
  sessionId: string;
  restoredAt: string;
  beforeSha256: string;
  afterSha256: string;
  prior: {
    takes: Collection["takes"];
    selectedTakeIds: Collection["selectedTakeIds"];
    explicitTakeSelections: Collection["explicitTakeSelections"];
    interviews: Collection["interviews"];
    chapters: Collection["chapters"];
    draftOutdated: Collection["draftOutdated"];
    status: Collection["status"];
    interviewPreparation: Collection["interviewPreparation"];
  };
  originalMedia: StoredMedia[];
  restoredUserTurnCount: number;
  clearedReplacementSelections: Array<{ questionId: string; takeId: string }>;
};

function sourceChoices(c: Collection) {
  return {
    takes: structuredClone(c.takes),
    selectedTakeIds: { ...c.selectedTakeIds },
    explicitTakeSelections: c.explicitTakeSelections
      ? { ...c.explicitTakeSelections }
      : undefined,
    interviews: structuredClone(c.interviews),
    chapters: structuredClone(c.chapters),
    draftOutdated: c.draftOutdated,
    status: c.status,
    interviewPreparation: structuredClone(c.interviewPreparation),
  };
}

/** Each immutable original is read once, even when many turns use its ranges. */
export async function verifiedInterviewMedia(
  collection: Collection,
  session: InterviewSession,
  findMedia: (id: string) => Promise<StoredMedia | null> = getMedia,
) {
  const media = new Map<string, StoredMedia>();
  for (const segment of session.segments) {
    if (
      !Number.isFinite(segment.startMs) ||
      segment.startMs < 0 ||
      !Number.isFinite(segment.durationMs) ||
      segment.durationMs <= 0
    )
      throw new InterviewRestorationError(
        "The saved original recording needs a source check.",
      );
    for (const id of [segment.mediaId, segment.audioMediaId].filter(
      Boolean,
    ) as string[]) {
      const stored = media.get(id) ?? (await findMedia(id));
      if (
        stored?.id !== id ||
        !isStoredOwnerRecording(
          stored,
          collection,
          id === segment.mediaId ? segment.kind : "voice",
        )
      )
        throw new InterviewRestorationError(
          "The saved original recording could not be verified. Your existing choices are unchanged.",
        );
      media.set(id, stored);
    }
  }
  return media;
}

/**
 * Explicit owner choice, not a legacy migration. Raw recordings, turns and takes
 * remain intact; only the chosen completed interview's inclusion choices change.
 * Queue preparation separately after this atomic save, with another source check.
 */
export async function restoreCompletedInterview(
  collectionId: string,
  options: {
    sessionId: string;
    processingApproved: true;
    expectedUpdatedAt: string;
    authorize: (collection: Collection) => Promise<void>;
  },
) {
  if (
    options.processingApproved !== true ||
    typeof options.sessionId !== "string" ||
    !options.sessionId.trim() ||
    typeof options.expectedUpdatedAt !== "string" ||
    !options.expectedUpdatedAt.trim() ||
    typeof options.authorize !== "function"
  )
    throw new InterviewRestorationError(
      "Confirm that you want to use your full saved interview before continuing.",
    );

  let audit: InterviewRestorationAudit | undefined;
  const collection = await mutateCollection(collectionId, async (current) => {
    await options.authorize(current);
    if (current.status === "approved")
      throw new InterviewRestorationError(
        "Approved stories cannot be replaced.",
        409,
      );
    if (current.updatedAt !== options.expectedUpdatedAt)
      throw new InterviewRestorationError(
        "Your saved answers changed. Refresh the page and choose again.",
        409,
      );
    const session = current.interviews?.find(
      (item) => item.id === options.sessionId,
    );
    if (
      !session ||
      session.provider !== "elevenlabs" ||
      session.status !== "completed"
    )
      throw new InterviewRestorationError(
        "Choose a completed saved conversation.",
      );
    if (
      session.turns.some(
        (turn) => turn.role === "user" && turn.supersedesTurnId,
      )
    )
      throw new InterviewRestorationError(
        "This interview has corrected answers that need a source review. Your recordings are preserved.",
        409,
      );
    if (!session.segments.length)
      throw new InterviewRestorationError(
        "The original conversation recording must finish saving first.",
      );
    const media = await verifiedInterviewMedia(current, session);

    const next = structuredClone(current);
    const restored = next.interviews!.find((item) => item.id === session.id)!;
    restored.excludedTurnIds = [];
    for (const chapter of CHAPTERS) {
      const answers = interviewAnswers({ interviews: [restored] }, chapter.id);
      if (!answers.length || answers.some((answer) => !answer.text.trim()))
        throw new InterviewRestorationError(
          "Your full interview needs saved words in all four story areas before it can be restored.",
        );
      for (const answer of answers)
        if (
          !(await hasRecordedAnswerSource(
            answer,
            next,
            async (id) => media.get(id) ?? null,
          ))
        )
          throw new InterviewRestorationError(
            "Each story area needs its saved original recording before restoration.",
          );
    }

    const clearedReplacementSelections: InterviewRestorationAudit["clearedReplacementSelections"] =
      [];
    for (const [questionId, takeId] of Object.entries(next.selectedTakeIds)) {
      const chapter = CHAPTERS.find(
        (item) =>
          questionId === item.id || questionId.startsWith(`${item.id}-f`),
      );
      if (!chapter) continue;
      const take = next.takes.find(
        (item) => item.id === takeId && item.questionId === questionId,
      );
      if (!take || take.replacesChapterId !== chapter.id)
        throw new InterviewRestorationError(
          "A separately selected recording needs a source choice before restoring the full interview. Your recordings are preserved.",
          409,
        );
      clearedReplacementSelections.push({ questionId, takeId });
      delete next.selectedTakeIds[questionId];
      if (next.explicitTakeSelections)
        delete next.explicitTakeSelections[questionId];
    }
    if (next.chapters.length) {
      next.draftOutdated = true;
      for (const chapter of next.chapters) {
        chapter.editorialReviewed = false;
        chapter.reviewedFilmSha256 = undefined;
      }
    }
    next.status = "recording";
    const prior = sourceChoices(current);
    const beforeSha256 = sha({ prior, originalMedia: [...media.values()] });
    const afterSha256 = sha(sourceChoices(next));
    const id = `restore_${sha({ collectionId, sessionId: session.id, beforeSha256 })}`;
    const candidate: InterviewRestorationAudit = {
      schemaVersion: 1,
      recordType: "interview-source-restoration",
      id,
      collectionId,
      sessionId: session.id,
      restoredAt: new Date().toISOString(),
      beforeSha256,
      afterSha256,
      prior,
      originalMedia: structuredClone([...media.values()]),
      restoredUserTurnCount: restored.turns.filter(
        (turn) => turn.role === "user",
      ).length,
      clearedReplacementSelections,
    };
    // Written first: a collection save failure may leave an un-applied audit, but
    // a successful source change can never occur without its private backup.
    audit = await mutateRecord<InterviewRestorationAudit>(id, (existing) => {
      if (!existing) return candidate;
      if (
        existing.recordType !== candidate.recordType ||
        existing.collectionId !== collectionId ||
        existing.sessionId !== session.id ||
        existing.beforeSha256 !== beforeSha256 ||
        existing.afterSha256 !== afterSha256
      )
        throw new InterviewRestorationError(
          "The saved source backup needs a check.",
          409,
        );
      return existing;
    });
    return next;
  });
  return {
    collection,
    restoration: {
      id: audit!.id,
      sessionId: audit!.sessionId,
      restoredAt: audit!.restoredAt,
      restoredUserTurnCount: audit!.restoredUserTurnCount,
      clearedReplacementSelectionsCount:
        audit!.clearedReplacementSelections.length,
      preservedTakeCount: collection.takes.length,
    },
  };
}
