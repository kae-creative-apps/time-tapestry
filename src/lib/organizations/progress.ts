import { CHAPTERS } from "../interview-state";
import type { Collection } from "../collection/types";

export type OrganizationChapterProgress = {
  chapterId: "q1" | "q2" | "q3" | "q4";
  status: "not_started" | "in_progress" | "completed" | "postcard_shipped";
  mailingAttention: boolean;
};
export const progressLabels: Record<
  OrganizationChapterProgress["status"],
  string
> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  postcard_shipped: "Postcard Shipped",
};

/** Sponsors receive status only. No titles, words, media, contacts, or collection keys. */
export function organizationChapterProgress(
  c: Collection | null,
): OrganizationChapterProgress[] {
  return CHAPTERS.map(({ id }) => {
    const chapter = c?.chapters.find((item) => item.id === id);
    const delivery = c?.deliveries.find((item) => item.chapterId === id);
    const completed = c?.status === "approved" && chapter?.editorialReviewed;
    const started = Boolean(
      chapter ||
      c?.takes.some((take) => take.questionId === id) ||
      c?.interviews?.some((session) =>
        session.turns.some(
          (turn) =>
            turn.role === "user" && turn.chapterId === id && turn.text.trim(),
        ),
      ),
    );
    const mailingAttention =
      delivery?.status === "failed" || delivery?.status === "returned";
    return {
      chapterId: id,
      status:
        delivery?.status === "mailed" && delivery.mailedAt
          ? "postcard_shipped"
          : completed
            ? "completed"
            : started
              ? "in_progress"
              : "not_started",
      mailingAttention,
    };
  });
}
