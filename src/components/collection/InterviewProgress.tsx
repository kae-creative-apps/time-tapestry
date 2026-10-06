import type { ChapterId } from "@/lib/interview-state";
import {
  getInterviewProgress,
  interviewChapterTitle,
} from "@/lib/collection/interview-progress";

export function InterviewProgress({
  activeChapterId = "q1",
  answeredChapterIds = [],
  faithFraming,
  variant = "live",
  paused = false,
}: {
  activeChapterId?: ChapterId;
  answeredChapterIds?: readonly string[];
  faithFraming?: "faith" | "beliefs";
  variant?: "live" | "intro";
  paused?: boolean;
}) {
  const progress = getInterviewProgress(activeChapterId, answeredChapterIds);
  const intro = variant === "intro";
  const remaining = progress.otherAreasRemaining;
  const status =
    progress.answeredCount === 4
      ? "You’ve shared an answer in all four areas."
      : remaining > 0
        ? `${remaining} other story ${remaining === 1 ? "area" : "areas"} to explore`
        : "This is the last area to explore.";

  return (
    <section
      className="border-b border-warmgray-200 bg-paper-100 px-5 py-5 text-ink-700 sm:px-8"
      aria-label={intro ? "The four story areas" : "Story area progress"}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-base font-medium">Your story, in four parts</h2>
        {!intro && (
          <p className="text-base text-ink-500" role="status" aria-live="polite">
            <span className="sr-only">Story area {progress.position} of 4. </span>
            {status}
          </p>
        )}
      </div>
      <ol className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4 sm:gap-x-6">
        {progress.areas.map((area, index) => {
          const current = !intro && area.active;
          return (
            <li
              key={area.id}
              aria-current={current ? "step" : undefined}
              className={`min-w-0 border-t-2 pt-3 ${current ? "border-espresso" : "border-warmgray-300"}`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${current ? "bg-espresso text-white" : "bg-paper-200 text-ink-500"}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className={`text-base leading-6 ${current ? "font-medium" : "text-ink-500"}`}>
                    {interviewChapterTitle(area.id, faithFraming)}
                  </p>
                  {!intro && (
                    <p className="mt-1 text-sm leading-5 text-ink-500">
                      {current ? (paused ? "Paused here" : "Here now") : area.answered ? "Answer shared" : "To explore"}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-sm leading-6 text-ink-500">
        Follow-ups depend on what you share. You can pause and return.
      </p>
    </section>
  );
}
