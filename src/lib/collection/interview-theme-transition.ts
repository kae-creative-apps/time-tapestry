import type { InterviewChapterId } from "./types";

/** Button intent can skip a part, but neither it nor a question is an answer. */
export function canChangeInterviewTheme(
  current: InterviewChapterId,
  requested: InterviewChapterId,
  answered: ReadonlySet<InterviewChapterId>,
  explicitlyRequested: InterviewChapterId | null,
  replacement?: InterviewChapterId,
) {
  if (replacement && requested !== replacement) return false;
  return (
    requested === current ||
    answered.has(current) ||
    explicitlyRequested === requested
  );
}
