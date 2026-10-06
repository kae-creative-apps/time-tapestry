import type { ChapterPackage } from "@/lib/collection/types";

/** A saved video is playable as a story film only when its artifact proves original voice. */
export function hasRecordedVoiceFilm(
  chapter: ChapterPackage,
): chapter is ChapterPackage & {
  videoMediaId: string;
  film: Extract<
    NonNullable<ChapterPackage["film"]>,
    { narrationKind: "original_recording" }
  >;
} {
  return Boolean(
    chapter.videoMediaId &&
    chapter.film?.mediaId === chapter.videoMediaId &&
    chapter.film.narrationKind === "original_recording",
  );
}
