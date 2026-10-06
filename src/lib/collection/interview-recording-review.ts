import {
  isMeaningfulInterviewSpeech,
  interviewSessionNeedsTranscriptRecovery,
} from "./interview-speech";
import { CHAPTERS } from "../interview-state";
import { interviewChapterTitle } from "./interview-progress";
import { recordedInterviewChapterIds } from "./interview-resume";
import type { Collection, CollectionView } from "./types";

export type InterviewReviewRecording = {
  mediaId: string;
  kind: "voice" | "video";
  fromInterview: boolean;
  /** Navigation only. Provider arrival times are not verified edit boundaries. */
  approximateStartSeconds?: number;
};

/** Original-only sessions can use the existing authenticated transcript recovery worker. */
export function unassignedInterviewRecordings(
  collection: Pick<Collection, "interviews">,
): InterviewReviewRecording[] {
  const recordings = new Map<string, InterviewReviewRecording>();
  for (const session of collection.interviews ?? []) {
    if (!interviewSessionNeedsTranscriptRecovery(session)) continue;
    for (const segment of session.segments)
      if (segment.mediaId)
        recordings.set(segment.mediaId, {
          mediaId: segment.mediaId,
          kind: segment.kind,
          fromInterview: true,
        });
  }
  return [...recordings.values()];
}

/** Read-only source projection. Never slices, rewrites, or substitutes narration. */
export function interviewRecordingReview(collection: CollectionView) {
  const ready = recordedInterviewChapterIds(collection);
  const unassigned = unassignedInterviewRecordings(collection);
  return CHAPTERS.map((chapter) => {
    const recordings = new Map<string, InterviewReviewRecording>();
    const transcript: string[] = [];
    const pendingReplacement = [...(collection.interviews ?? [])]
      .reverse()
      .find(
        (session) =>
          session.replacesChapterId === chapter.id &&
          !session.replacementCommittedAt &&
          session.segments.length > 0,
      );
    if (pendingReplacement)
      for (const segment of pendingReplacement.segments)
        recordings.set(segment.mediaId, {
          mediaId: segment.mediaId,
          kind: segment.kind,
          fromInterview: true,
        });
    for (const take of collection.takes) {
      if (
        take.kind === "text" ||
        take.liveSource ||
        !take.mediaId ||
        collection.selectedTakeIds[take.questionId] !== take.id ||
        !(
          take.questionId === chapter.id ||
          take.questionId.startsWith(`${chapter.id}-f`)
        )
      )
        continue;
      recordings.set(take.mediaId, {
        mediaId: take.mediaId,
        kind: take.kind,
        fromInterview: false,
      });
      if (isMeaningfulInterviewSpeech(take.text)) transcript.push(take.text);
    }
    for (const session of collection.interviews ?? []) {
      const superseded = new Set(
        session.turns.map((turn) => turn.supersedesTurnId).filter(Boolean),
      );
      const turns = [...session.turns]
        .sort((a, b) => a.sequence - b.sequence)
        .filter(
          (turn) =>
            turn.role === "user" &&
            turn.chapterId === chapter.id &&
            isMeaningfulInterviewSpeech(turn.text) &&
            !session.excludedTurnIds.includes(turn.id) &&
            !superseded.has(turn.id),
        );
      for (const turn of turns) {
        transcript.push(turn.text);
        const estimated =
          turn.timing === "estimated" &&
          Number.isFinite(turn.startMs) &&
          Number.isFinite(turn.endMs) &&
          turn.endMs! > turn.startMs!;
        const overlapping = estimated
          ? session.segments.filter(
              (segment) =>
                segment.startMs < turn.endMs! &&
                segment.startMs + segment.durationMs > turn.startMs!,
            )
          : [];
        // Unaligned answers remain replayable as complete originals, without a guessed chapter cut.
        for (const segment of overlapping.length
          ? overlapping
          : session.segments) {
          if (!segment.mediaId) continue;
          const start =
            estimated && overlapping.length
              ? Math.max(
                  0,
                  Math.floor((turn.startMs! - segment.startMs) / 1000) - 2,
                )
              : undefined;
          const earlier = recordings.get(segment.mediaId);
          recordings.set(segment.mediaId, {
            mediaId: segment.mediaId,
            kind: segment.kind,
            fromInterview: true,
            ...(start !== undefined &&
            (!earlier || earlier.approximateStartSeconds !== undefined)
              ? {
                  approximateStartSeconds: Math.min(
                    start,
                    earlier?.approximateStartSeconds ?? start,
                  ),
                }
              : {}),
          });
        }
      }
    }
    const awaitingChapterMatch =
      Boolean(pendingReplacement) ||
      (recordings.size === 0 && unassigned.length > 0);
    return {
      id: chapter.id,
      title: interviewChapterTitle(chapter.id, collection.faithFraming),
      ready: ready.includes(chapter.id),
      recordings: recordings.size
        ? [...recordings.values()]
        : awaitingChapterMatch
          ? unassigned
          : [],
      awaitingChapterMatch,
      replacementPending: Boolean(pendingReplacement),
      transcript: pendingReplacement ? "" : transcript.join("\n\n"),
    };
  });
}

export type InterviewReviewChapter = ReturnType<
  typeof interviewRecordingReview
>[number];

export function interviewReviewPath(
  collectionId: string,
  accessKey: string,
  chapterId?: string,
) {
  return `/record/${encodeURIComponent(collectionId)}/review?key=${encodeURIComponent(accessKey)}${chapterId && /^q[1-4]$/.test(chapterId) ? `&chapter=${chapterId}` : ""}`;
}

export function interviewRerecordPath(
  collectionId: string,
  accessKey: string,
  chapterId: string,
) {
  return `/record/${encodeURIComponent(collectionId)}?key=${encodeURIComponent(accessKey)}&rerecord=${encodeURIComponent(chapterId)}`;
}
