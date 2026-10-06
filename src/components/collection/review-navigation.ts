export type ReviewLocation = { step: 0 | 1 | 2; chapterId: string };

/** The fragment remembers only a UI position, never story text or credentials. */
export function reviewLocation(hash: string): ReviewLocation | null {
  const chapter = hash.match(/^#review\/chapter\/(q[1-4])$/)?.[1];
  if (chapter) return { step: 0, chapterId: chapter };
  if (hash === "#review/postcards") return { step: 1, chapterId: "q1" };
  if (hash === "#review/approve") return { step: 2, chapterId: "q1" };
  if (!hash) return { step: 0, chapterId: "q1" };
  // Skip links and page anchors own their focus behavior. They must not change
  // the review step or chapter that is currently on screen.
  return null;
}

export function reviewFragment(position: ReviewLocation) {
  return position.step === 1
    ? "#review/postcards"
    : position.step === 2
      ? "#review/approve"
      : `#review/chapter/${/^q[1-4]$/.test(position.chapterId) ? position.chapterId : "q1"}`;
}

export function rememberReviewLocation(
  location: Pick<Location, "pathname" | "search" | "hash">,
  history: Pick<History, "state" | "pushState">,
  position: ReviewLocation,
) {
  const hash = reviewFragment(position);
  if (location.hash !== hash)
    history.pushState(
      history.state,
      "",
      `${location.pathname}${location.search}${hash}`,
    );
}
