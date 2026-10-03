/** Device draft reconciliation. Server edits and local edits are never merged implicitly. */
export type StoryDraft = {
  title: string;
  content: string;
  postcardNote: string;
  blessing: {
    encouragement: string;
    scriptureReference: string;
    scriptureText: string;
    scriptureTranslation: string;
  };
};
export type RetainedStoryDraft = {
  id: string;
  savedAt: string;
  label: string;
  draft: StoryDraft;
};
export type DeviceStoryDraft = {
  version: 2;
  draft: StoryDraft;
  base: StoryDraft;
  reviewed: boolean;
  videoMediaId?: string;
  reviewedFilmSha256?: string;
  history: RetainedStoryDraft[];
  recovery?: StoryDraft;
};
export const emptyStoryBlessing = {
  encouragement: "",
  scriptureReference: "",
  scriptureText: "",
  scriptureTranslation: "",
};
export function isStoryDraft(value: unknown): value is StoryDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as StoryDraft;
  return (
    typeof draft.title === "string" &&
    typeof draft.content === "string" &&
    typeof draft.postcardNote === "string" &&
    !!draft.blessing &&
    Object.keys(emptyStoryBlessing).every(
      (key) =>
        typeof draft.blessing[key as keyof typeof emptyStoryBlessing] ===
        "string",
    )
  );
}
export function storyDraftSignature(draft: StoryDraft) {
  return JSON.stringify([
    draft.title,
    draft.content,
    draft.postcardNote,
    draft.blessing.encouragement,
    draft.blessing.scriptureReference,
    draft.blessing.scriptureText,
    draft.blessing.scriptureTranslation,
  ]);
}
export const sameStoryDraft = (first: StoryDraft, second: StoryDraft) =>
  storyDraftSignature(first) === storyDraftSignature(second);
export function reconcileStoryDraft(
  base: StoryDraft,
  local: StoryDraft,
  server: StoryDraft,
) {
  if (sameStoryDraft(base, server)) return "unchanged" as const;
  return sameStoryDraft(local, base) || sameStoryDraft(local, server)
    ? ("synchronize" as const)
    : ("conflict" as const);
}
export function retainStoryDraft(
  history: RetainedStoryDraft[],
  draft: StoryDraft,
  label: string,
  id: string,
  savedAt: string,
): RetainedStoryDraft[] {
  if (history.some((copy) => sameStoryDraft(copy.draft, draft))) return history;
  return [...history, { id, savedAt, label, draft }];
}

export function recoverStoryDraft(
  raw: string,
  server: StoryDraft,
  film: { videoMediaId?: string; outputSha256?: string },
) {
  const value = JSON.parse(raw) as Partial<DeviceStoryDraft>;
  if (!value || !isStoryDraft(value.draft))
    throw new Error("The device draft could not be read.");
  const history = Array.isArray(value.history)
    ? value.history.filter(
        (copy) =>
          copy &&
          typeof copy.id === "string" &&
          typeof copy.savedAt === "string" &&
          typeof copy.label === "string" &&
          isStoryDraft(copy.draft),
      )
    : [];
  const candidate = isStoryDraft(value.recovery) ? value.recovery : value.draft;
  const filmMatches =
    value.videoMediaId === film.videoMediaId &&
    value.reviewedFilmSha256 === film.outputSha256;
  // A saved, clean snapshot is not an unsaved edit. Prefer a newer server version.
  if (
    !value.recovery &&
    isStoryDraft(value.base) &&
    sameStoryDraft(value.draft, value.base) &&
    !sameStoryDraft(value.draft, server)
  ) {
    return {
      kind: "clean" as const,
      draft: server,
      recovery: undefined,
      reviewed: false,
      history,
    };
  }
  // Legacy drafts have no baseline, so differing words always need an explicit choice.
  const conflict =
    !sameStoryDraft(candidate, server) &&
    (Boolean(value.recovery) ||
      !isStoryDraft(value.base) ||
      !sameStoryDraft(value.base, server));
  return {
    kind: conflict
      ? ("conflict" as const)
      : sameStoryDraft(candidate, server)
        ? ("clean" as const)
        : ("restore" as const),
    draft: conflict ? server : candidate,
    recovery: conflict ? candidate : undefined,
    reviewed: !conflict && filmMatches && Boolean(value.reviewed),
    history,
  };
}
