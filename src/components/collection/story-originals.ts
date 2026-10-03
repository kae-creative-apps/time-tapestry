import { interviewAnswers } from "@/lib/collection/interview";
import type {
  ChapterPackage,
  Collection,
  AnswerTake,
} from "@/lib/collection/types";

export type StoryOriginal = {
  mediaId: string;
  kind: "voice" | "video";
  fromInterview: boolean;
  sourceTakeIds: string[];
};

/** Resolve only this draft's referenced sources. Playback always uses the complete saved file. */
export function storyOriginals(
  collection: Pick<Collection, "takes" | "interviews">,
  chapter: Pick<ChapterPackage, "id" | "sourceTakeIds">,
): StoryOriginal[] {
  const answers = new Map<string, AnswerTake>(
    [...collection.takes, ...interviewAnswers(collection, chapter.id)].map(
      (take) => [take.id, take],
    ),
  );
  const originals = new Map<string, StoryOriginal>();
  function add(
    mediaId: string,
    kind: "voice" | "video",
    fromInterview: boolean,
    sourceTakeId: string,
  ) {
    const existing = originals.get(mediaId);
    if (existing) {
      if (!existing.sourceTakeIds.includes(sourceTakeId))
        existing.sourceTakeIds.push(sourceTakeId);
      existing.fromInterview ||= fromInterview;
    } else {
      originals.set(mediaId, {
        mediaId,
        kind,
        fromInterview,
        sourceTakeIds: [sourceTakeId],
      });
    }
  }
  for (const id of chapter.sourceTakeIds) {
    const take = answers.get(id);
    if (!take) continue;
    if (take.liveSource) {
      const session = collection.interviews?.find(
        (item) => item.id === take.liveSource?.sessionId,
      );
      for (const range of take.liveSource.sourceRanges) {
        const segment = session?.segments.find(
          (item) =>
            item.id === range.segmentId && item.mediaId === range.mediaId,
        );
        if (segment) add(segment.mediaId, segment.kind, true, take.id);
      }
    } else if (take.mediaId && take.kind !== "text") {
      add(take.mediaId, take.kind, false, take.id);
    }
  }
  return [...originals.values()];
}
