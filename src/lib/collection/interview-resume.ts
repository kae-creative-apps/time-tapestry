import { isMeaningfulInterviewSpeech } from "./interview-speech";
import {
  CHAPTERS,
  getChapterQuestion,
  type ChapterId,
} from "../interview-state";
import { detectInterviewThemeFromQuestion } from "./interview-progress";
import type { Collection, CollectionView, InterviewTurn } from "./types";

type ResumeSource = Pick<
  Collection | CollectionView,
  | "takes"
  | "selectedTakeIds"
  | "interviews"
  | "currentQuestion"
  | "faithFraming"
  | "recipient"
>;

function includedTurns(
  session: NonNullable<ResumeSource["interviews"]>[number],
) {
  const superseded = new Set(
    session.turns.map((turn) => turn.supersedesTurnId).filter(Boolean),
  );
  return session.turns
    .filter(
      (turn) =>
        !session.excludedTurnIds.includes(turn.id) && !superseded.has(turn.id),
    )
    .sort((a, b) => a.sequence - b.sequence);
}

/** UI coverage only. The server separately verifies recorded media before preparation. */
export function recordedInterviewChapterIds(c: ResumeSource): ChapterId[] {
  return CHAPTERS.filter(
    (chapter) =>
      c.takes.some(
        (take) =>
          take.kind !== "text" &&
          !take.liveSource &&
          take.mediaId &&
          isMeaningfulInterviewSpeech(take.text) &&
          (take.questionId === chapter.id ||
            take.questionId.startsWith(`${chapter.id}-f`)) &&
          c.selectedTakeIds[take.questionId] === take.id,
      ) ||
      c.interviews?.some(
        (session) =>
          session.segments.some((segment) => segment.mediaId) &&
          includedTurns(session).some(
            (turn) =>
              turn.role === "user" &&
              turn.chapterId === chapter.id &&
              isMeaningfulInterviewSpeech(turn.text),
          ),
      ),
  ).map((chapter) => chapter.id);
}

/** Restores navigation from saved source data, never opens a microphone or camera. */
export function interviewResumeState(c: ResumeSource) {
  const sessions = [...(c.interviews ?? [])].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
  const session =
    [...sessions].reverse().find((item) => includedTurns(item).length > 0) ??
    sessions.at(-1);
  const turns = session ? includedTurns(session) : [];
  const lastQuestion = [...turns]
    .reverse()
    .find(
      (turn) => turn.role === "agent" && isMeaningfulInterviewSpeech(turn.text),
    );
  const lastAnswer = [...turns]
    .reverse()
    .find(
      (turn) =>
        turn.role === "user" &&
        turn.chapterId &&
        isMeaningfulInterviewSpeech(turn.text),
    );
  const detected =
    lastQuestion && (!lastAnswer || lastQuestion.sequence > lastAnswer.sequence)
      ? detectInterviewThemeFromQuestion(lastQuestion.text)
      : null;
  const chapterId: ChapterId =
    detected ||
    lastAnswer?.chapterId ||
    CHAPTERS[Math.max(0, Math.min(3, c.currentQuestion || 0))].id;
  const latestSegment = sessions
    .flatMap((item) => item.segments)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const latestTake = c.takes
    .filter(
      (take) =>
        take.kind !== "text" && c.selectedTakeIds[take.questionId] === take.id,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
  const answeredChapterIds = recordedInterviewChapterIds(c);
  return {
    chapterId,
    chapterIndex: CHAPTERS.findIndex((chapter) => chapter.id === chapterId),
    question:
      lastQuestion?.text ||
      getChapterQuestion(chapterId, {
        recipientName: c.recipient.name,
        faithFraming: c.faithFraming,
      }),
    kind:
      latestTake &&
      (!latestSegment || latestTake.createdAt > latestSegment.createdAt)
        ? latestTake.kind === "voice"
          ? "voice"
          : "video"
        : (latestSegment?.kind ?? "video"),
    hasSavedProgress: turns.length > 0 || Boolean(latestSegment || latestTake),
    answeredChapterIds,
    missingChapterIds: CHAPTERS.filter(
      (chapter) => !answeredChapterIds.includes(chapter.id),
    ).map((chapter) => chapter.id),
    lastQuestion: lastQuestion as InterviewTurn | undefined,
  };
}
