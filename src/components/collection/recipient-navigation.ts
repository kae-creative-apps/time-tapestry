type PageLocation = Pick<Location, "pathname" | "search" | "hash">;
type PageHistory = Pick<History, "state" | "pushState" | "replaceState">;

/** The fragment stores UI position only. A chapter QR route remains the default. */
export function recipientChapter(hash: string, initialChapter = "q1") {
  if (!hash) return /^q[1-4]$/.test(initialChapter) ? initialChapter : "q1";
  return /^#story\/(q[1-4])$/.exec(hash)?.[1] ?? null;
}

export function rememberRecipientChapter(
  location: PageLocation,
  history: PageHistory,
  chapterId: string,
  recording = false,
) {
  if (recording || !/^q[1-4]$/.test(chapterId)) return false;
  const hash = `#story/${chapterId}`;
  if (location.hash !== hash)
    history.pushState(
      history.state,
      "",
      `${location.pathname}${location.search}${hash}`,
    );
  return true;
}

export function restoreRecipientChapter(
  location: PageLocation,
  history: PageHistory,
  initialChapter: string | undefined,
  currentChapter: string,
  recording: boolean,
) {
  const next = recipientChapter(location.hash, initialChapter);
  // Page anchors, including the skip link, keep their own focus behavior.
  if (!next) return null;
  if (recording && next !== currentChapter) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}#story/${currentChapter}`,
    );
    return null;
  }
  return next;
}
