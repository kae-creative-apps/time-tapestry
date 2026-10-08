import type { InterviewSession, InterviewTurn } from "./types";
import { sourceTokenCount } from "./films/word-matching";

/** Live turns use random ids. Only recovery names words it read from a saved original. */
export const RECOVERED_TURN_PREFIX = "source-";

export function isRecoveredRecordingTurn(
  turn: Pick<InterviewTurn, "id" | "role" | "timing">,
): boolean {
  return (
    turn.role === "user" &&
    turn.timing === "unaligned" &&
    turn.id.startsWith(RECOVERED_TURN_PREFIX)
  );
}

/** Lexical evidence only, not a quality or length judgment about an answer. */
export function isMeaningfulInterviewSpeech(text: unknown): text is string {
  if (typeof text !== "string") return false;
  // Controls can arrive without sourceMedium=text, including old SDK versions.
  const spoken = text.replace(
    /\[\s*Interview\s+control\s*:[^\]]*(?:\]|$)/giu,
    "",
  );
  return /[\p{L}\p{N}]/u.test(spoken);
}

/** Recovery eligibility is not chapter completion. Never restore deliberately omitted speech. */
export function interviewSessionNeedsTranscriptRecovery(
  session: InterviewSession,
): boolean {
  if (session.provider !== "elevenlabs" || !session.segments.length)
    return false;
  const superseded = new Set(
    session.turns.map((turn) => turn.supersedesTurnId).filter(Boolean),
  );
  const spoken = session.turns.filter(
    (turn) => turn.role === "user" && isMeaningfulInterviewSpeech(turn.text),
  );
  const included = spoken.filter(
    (turn) =>
      !session.excludedTurnIds.includes(turn.id) && !superseded.has(turn.id),
  );
  if (!included.length) return spoken.length === 0;
  if (session.replacesChapterId) {
    const retake = included.filter(
      (turn) => turn.chapterId === session.replacesChapterId,
    );
    // A complete retake is the chapter. A few short fragments are not, so the
    // rest of that recording can still be recovered.
    if (retake.some((turn) => sourceTokenCount(turn.text) >= 4)) return false;
  }
  if (included.some((turn) => !turn.chapterId)) return true;
  if (new Set(included.map((turn) => turn.chapterId)).size === 4) return false;
  return (
    session.status === "completed" ||
    session.turns.some(
      (turn) =>
        turn.role === "user" &&
        !isMeaningfulInterviewSpeech(turn.text) &&
        !session.excludedTurnIds.includes(turn.id) &&
        !superseded.has(turn.id),
    )
  );
}
