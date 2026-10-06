/** Refresh only untouched fields. A delayed server response must never erase typing. */
export function mergePostcardDrafts(
  current: Record<string, string>,
  baseline: Record<string, string>,
  incoming: Record<string, string>,
) {
  return Object.fromEntries(
    Object.keys(incoming).map((id) => [
      id,
      current[id] === baseline[id]
        ? incoming[id]
        : (current[id] ?? incoming[id]),
    ]),
  );
}

export function postcardDraftsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((id) => a[id] === b[id])
  );
}

/** Report every blocked card so an empty message on another card is recoverable. */
export function postcardDraftProblems(
  messages: Record<string, string>,
  chapterIds: string[],
  limit: number,
) {
  return chapterIds.flatMap((id) => {
    const words = messages[id]?.trim() || "";
    if (!words)
      return [{ id, message: "Add a short message or use your saved words." }];
    if (words.length > limit)
      return [{ id, message: `Keep this message to ${limit} characters.` }];
    return [];
  });
}

export function restorePostcardWords(
  messages: Record<string, string>,
  saved: Record<string, string>,
  chapterId: string,
) {
  return { ...messages, [chapterId]: saved[chapterId] || "" };
}

export function postcardProblemSummary(
  problems: Array<{ id: string }>,
  chapterIds: string[],
) {
  const cards = chapterIds.flatMap((id, index) =>
    problems.some((problem) => problem.id === id) ? [index + 1] : [],
  );
  return cards.length
    ? `Check ${cards.length === 1 ? "card" : "cards"} ${cards.join(", ")} before saving your postcard words.`
    : "";
}
