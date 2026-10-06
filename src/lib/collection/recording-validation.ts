import type {
  AnswerTake,
  ChapterPackage,
  Collection,
  StoredMedia,
} from "./types";

type RecordingCollection = Pick<Collection, "id" | "chapters" | "draftHistory">;

/** Worker output IDs were reserved before provenance was persisted. */
export function isGeneratedFilmMedia(
  media: Pick<StoredMedia, "id" | "provenance">,
  collection?: RecordingCollection,
): boolean {
  if (
    media.provenance === "generated_film" ||
    media.id.startsWith("filmmedia_")
  )
    return true;
  const chapters = [
    ...(collection?.chapters ?? []),
    ...(collection?.draftHistory ?? []).flatMap((version) => version.chapters),
  ];
  return chapters.some(
    (chapter) =>
      chapter.film &&
      (chapter.film.mediaId === media.id || chapter.videoMediaId === media.id),
  );
}

/** Keep legacy output classification after its visible chapter attachment changes. */
export async function preserveGeneratedFilmProvenance(
  collectionId: string,
  chapter: Pick<ChapterPackage, "film" | "videoMediaId">,
  findMedia: (id: string) => Promise<StoredMedia | null>,
  saveMedia: (media: StoredMedia) => Promise<unknown>,
): Promise<void> {
  if (!chapter.film) return;
  for (const id of new Set([chapter.film.mediaId, chapter.videoMediaId])) {
    if (!id) continue;
    const media = await findMedia(id);
    if (
      media?.collectionId === collectionId &&
      media.provenance !== "generated_film"
    )
      await saveMedia({ ...media, provenance: "generated_film" });
  }
}

/** An upload reservation is not a saved recording. Share this check at submission boundaries. */
export function isStoredOwnerRecording(
  media: StoredMedia | null | undefined,
  collection: string | RecordingCollection,
  kind?: "voice" | "video",
): media is StoredMedia {
  const collectionId =
    typeof collection === "string" ? collection : collection.id;
  if (
    !media ||
    media.collectionId !== collectionId ||
    media.role !== "owner" ||
    isGeneratedFilmMedia(
      media,
      typeof collection === "string" ? undefined : collection,
    ) ||
    !Number.isSafeInteger(media.bytes) ||
    media.bytes <= 0 ||
    ![media.url, media.localPath].some(
      (location) => typeof location === "string" && Boolean(location.trim()),
    )
  )
    return false;
  const prefix =
    kind === "video" ? "video/" : kind === "voice" ? "audio/" : null;
  return prefix
    ? media.mimeType.startsWith(prefix)
    : /^(audio|video)\//.test(media.mimeType);
}

/** Transcript text can be submitted alongside its saved recording. */
export async function hasRecordedAnswerSource(
  answer: AnswerTake,
  collection: string | RecordingCollection,
  findMedia: (id: string) => Promise<StoredMedia | null>,
): Promise<boolean> {
  if (answer.kind !== "voice" && answer.kind !== "video") return false;
  const ids = answer.liveSource
    ? answer.liveSource.sourceRanges.map((range) => range.mediaId)
    : answer.mediaId
      ? [answer.mediaId]
      : [];
  if (!ids.length) return false;
  for (const id of new Set(ids)) {
    const media = await findMedia(id);
    // A resumed conversation can contain both audio and video segments.
    if (
      !isStoredOwnerRecording(
        media,
        collection,
        answer.liveSource ? undefined : answer.kind,
      )
    )
      return false;
  }
  return true;
}
