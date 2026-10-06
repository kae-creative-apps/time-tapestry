import type { InterviewSession } from "./types";

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
  if (
    session.replacesChapterId &&
    included.some((turn) => turn.chapterId === session.replacesChapterId)
  )
    return false;
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
