import { getCollection, getMedia, mutateRecord, readRecord } from "../store";
import type { Collection, StoredMedia } from "../types";
import { selectedAnswers } from "../content";
import { CHAPTERS } from "../../interview-state";
import { sha256 } from "./plan";
import type {
  FilmChapter,
  OriginalChapterEdit,
  OriginalFilmEdit,
  OriginalFilmSource,
  OriginalSourceSnapshot,
  StoryFilmJob,
} from "./types";

export const ORIGINAL_TEMPLATE_VERSION = "original-story-v1";
export const originalProbeKey = (mediaId: string) =>
  `film-probe-${sha256(mediaId).slice(0, 48)}`;
export type OriginalProbe = {
  mediaId: string;
  metadataSha256: string;
  sourceSha256: string;
  durationMs: number;
};
const editKey = (id: string) => `film-edit-${id}`;
export const getOriginalFilmEdit = (id: string) =>
  readRecord<OriginalFilmEdit>(editKey(id));

/** This is a source association, never an automatically inferred speech boundary. */
export async function originalFilmSources(
  c: Collection,
): Promise<OriginalFilmSource[]> {
  const sources = new Map<string, OriginalFilmSource>();
  const add = (
    mediaId: string,
    kind: "video" | "audio",
    durationMs: number | undefined,
    fromInterview: boolean,
    chapterId: string,
    sourceTakeId: string,
    createdAt: string,
  ) => {
    const source = sources.get(mediaId) ?? {
      mediaId,
      kind,
      durationMs:
        Number.isFinite(durationMs) && durationMs! > 0
          ? Math.round(durationMs!)
          : null,
      createdAt,
      fromInterview,
      chapterIds: [],
      sourceTakeIds: [],
    };
    if (!source.chapterIds.includes(chapterId))
      source.chapterIds.push(chapterId);
    if (!source.sourceTakeIds.includes(sourceTakeId))
      source.sourceTakeIds.push(sourceTakeId);
    sources.set(mediaId, source);
  };
  for (const chapter of c.chapters) {
    for (const answer of selectedAnswers(c, chapter.id)) {
      if (!chapter.sourceTakeIds.includes(answer.id)) continue;
      if (answer.liveSource) {
        const session = c.interviews?.find(
          (item) => item.id === answer.liveSource!.sessionId,
        );
        for (const range of answer.liveSource.sourceRanges) {
          const segment = session?.segments.find(
            (item) =>
              item.id === range.segmentId && item.mediaId === range.mediaId,
          );
          if (segment)
            add(
              segment.mediaId,
              segment.kind === "video" ? "video" : "audio",
              segment.durationMs,
              true,
              chapter.id,
              answer.id,
              segment.createdAt,
            );
        }
      } else if (answer.mediaId && answer.kind !== "text") {
        add(
          answer.mediaId,
          answer.kind === "video" ? "video" : "audio",
          answer.durationSeconds === undefined
            ? undefined
            : answer.durationSeconds * 1000,
          false,
          chapter.id,
          answer.id,
          answer.createdAt,
        );
      }
    }
  }
  const result: OriginalFilmSource[] = [];
  for (const source of sources.values()) {
    const media = await getMedia(source.mediaId);
    if (
      media &&
      media.collectionId === c.id &&
      media.role === "owner" &&
      /^(audio|video)\//.test(media.mimeType) &&
      (media.localPath || media.url)
    ) {
      const probe = await readRecord<OriginalProbe>(originalProbeKey(media.id));
      result.push({
        ...source,
        kind: media.mimeType.startsWith("video/") ? "video" : "audio",
        ...(probe?.metadataSha256 === sourceMetadataHash(media)
          ? { durationMs: probe.durationMs }
          : {}),
      });
    }
  }
  return result;
}

export const sourceMetadataHash = (media: StoredMedia) =>
  sha256(
    JSON.stringify({
      id: media.id,
      collectionId: media.collectionId,
      role: media.role,
      mimeType: media.mimeType,
      bytes: media.bytes,
      createdAt: media.createdAt,
      location: media.localPath || media.url,
    }),
  );

export function originalCollectionHash(c: Collection) {
  if (c.chapters.length !== 4 || c.draftOutdated)
    throw new Error(
      "Review all four current written stories before preparing original films.",
    );
  const chapters = CHAPTERS.map(({ id }) => {
    const chapter = c.chapters.find((item) => item.id === id);
    if (!chapter?.content.trim())
      throw new Error("Each chapter needs its current written story.");
    const answers = selectedAnswers(c, id);
    if (
      !answers.length ||
      answers.length !== chapter.sourceTakeIds.length ||
      answers.some((answer) => !chapter.sourceTakeIds.includes(answer.id))
    )
      throw new Error(
        "Your source answers changed. Recreate the written drafts before preparing these films.",
      );
    return {
      id,
      title: chapter.title,
      content: chapter.content,
      sourceTakeIds: chapter.sourceTakeIds,
      answers,
    };
  });
  return sha256(
    JSON.stringify({
      collectionId: c.id,
      storytellerName: c.storyteller.name,
      chapters,
    }),
  );
}

export function validateOriginalSelections(
  input: unknown,
  sources: OriginalFilmSource[],
  complete = false,
): OriginalChapterEdit[] {
  if (
    !Array.isArray(input) ||
    input.length > 4 ||
    (complete && input.length !== 4)
  )
    throw new Error(
      "Choose clips for all four chapters before creating films.",
    );
  const seen = new Set<string>();
  const chapters = input.map((value): OriginalChapterEdit => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid chapter edit.");
    const item = value as Record<string, unknown>;
    if (
      typeof item.chapterId !== "string" ||
      !/^q[1-4]$/.test(item.chapterId) ||
      seen.has(item.chapterId)
    )
      throw new Error("Each chapter may appear once in an edit.");
    seen.add(item.chapterId);
    if (item.presentation !== "video" && item.presentation !== "audio")
      throw new Error("Choose video or voice with artwork for this chapter.");
    if (
      !Array.isArray(item.clips) ||
      item.clips.length > 40 ||
      (complete && !item.clips.length)
    )
      throw new Error(
        "Choose between one and forty clips for each finished chapter.",
      );
    const clips = item.clips.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid recording selection.");
      const clip = value as Record<string, unknown>;
      if (
        typeof clip.mediaId !== "string" ||
        !/^[a-zA-Z0-9_-]{8,80}$/.test(clip.mediaId)
      )
        throw new Error("Choose a saved original recording.");
      const source = sources.find(
        (entry) =>
          entry.mediaId === clip.mediaId &&
          entry.chapterIds.includes(item.chapterId as string),
      );
      if (!source)
        throw new Error(
          "This recording is not an original source for this chapter.",
        );
      if (
        typeof clip.inMs !== "number" ||
        typeof clip.outMs !== "number" ||
        !Number.isSafeInteger(clip.inMs) ||
        !Number.isSafeInteger(clip.outMs) ||
        clip.inMs < 0 ||
        clip.outMs <= clip.inMs ||
        clip.outMs > 2 * 3600000
      )
        throw new Error(
          "Each clip needs valid start and end times in milliseconds.",
        );
      // Browser recording metadata is an estimate. The worker independently
      // measures the actual file and verifies every bound before rendering.
      return { mediaId: clip.mediaId, inMs: clip.inMs, outMs: clip.outMs };
    });
    if (
      clips.reduce(
        (duration, clip) => duration + (clip.outMs - clip.inMs),
        7000,
      ) > 3600000
    )
      throw new Error(
        "Each complete film must be one hour or shorter, including its title and closer.",
      );
    return {
      chapterId: item.chapterId,
      presentation: item.presentation,
      clips,
    };
  });
  return chapters.sort((a, b) => a.chapterId.localeCompare(b.chapterId));
}

export class OriginalEditConflict extends Error {
  readonly status = 409;
}

export async function saveOriginalFilmEdit(
  c: Collection,
  input: unknown,
  baseRevisionHash: unknown,
) {
  if (
    baseRevisionHash !== null &&
    (typeof baseRevisionHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(baseRevisionHash))
  )
    throw new OriginalEditConflict(
      "Reload this edit before saving so another saved version is not overwritten.",
    );
  if (c.status === "approved")
    throw new Error("Published collections cannot be edited.");
  const storyHash = originalCollectionHash(c);
  const chapters = validateOriginalSelections(
    input,
    await originalFilmSources(c),
  );
  const revisionHash = sha256(
    JSON.stringify({
      storyHash,
      chapters,
      template: ORIGINAL_TEMPLATE_VERSION,
    }),
  );
  return mutateRecord<OriginalFilmEdit>(editKey(c.id), async (previous) => {
    if ((previous?.revisionHash ?? null) !== baseRevisionHash)
      throw new OriginalEditConflict(
        "These cuts were saved in another tab. Reload the latest edit before saving your changes.",
      );
    const current = await getCollection(c.id);
    if (
      !current ||
      current.status === "approved" ||
      originalCollectionHash(current) !== storyHash
    )
      throw new Error(
        "Your stories changed while saving these cuts. Reload the current version.",
      );
    return {
      schemaVersion: 1,
      collectionId: c.id,
      revisionHash,
      storyHash,
      chapters,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function prepareOriginalJob(
  c: Collection,
  planHash: string,
  cutsApproved: boolean,
  allowNoCaptions: boolean,
) {
  if (!cutsApproved || !allowNoCaptions)
    throw new Error(
      "Review every selected clip and confirm that these films use original sound without timed captions.",
    );
  const edit = await getOriginalFilmEdit(c.id);
  if (
    !edit ||
    edit.revisionHash !== planHash ||
    edit.storyHash !== originalCollectionHash(c)
  )
    throw new Error(
      "The selected cuts changed. Save and review the current edit before creating films.",
    );
  const sources = await originalFilmSources(c);
  const edits = validateOriginalSelections(edit.chapters, sources, true);
  const selectedIds = new Set(
    edits.flatMap((chapter) => chapter.clips.map((clip) => clip.mediaId)),
  );
  const snapshots: OriginalSourceSnapshot[] = [];
  for (const source of sources.filter((item) =>
    selectedIds.has(item.mediaId),
  )) {
    const media = await getMedia(source.mediaId);
    if (!media || media.collectionId !== c.id || media.role !== "owner")
      throw new Error("An original recording is no longer available.");
    snapshots.push({ ...source, metadataSha256: sourceMetadataHash(media) });
  }
  const chapters: FilmChapter[] = edits.map((sourceEdit, index) => {
    const chapter = c.chapters.find(
      (item) => item.id === sourceEdit.chapterId,
    )!;
    return {
      chapterId: chapter.id,
      chapterNumber: (index + 1) as 1 | 2 | 3 | 4,
      title: chapter.title,
      content: chapter.content,
      script: "",
      scriptSha256: sha256(chapter.content),
      sourceTakeIds: [...chapter.sourceTakeIds],
      sourceSha256: sha256(
        JSON.stringify({
          storyHash: edit.storyHash,
          sourceEdit,
          sources: snapshots.filter((source) =>
            sourceEdit.clips.some((clip) => clip.mediaId === source.mediaId),
          ),
        }),
      ),
      sourceEdit,
      status: "queued",
      progress: 0,
    };
  });
  return {
    edit,
    chapters,
    snapshots,
    versionHash: sha256(
      JSON.stringify({
        mode: "original",
        planHash,
        snapshots: snapshots.map(
          ({ durationMs: _durationMs, ...source }) => source,
        ),
        template: ORIGINAL_TEMPLATE_VERSION,
      }),
    ),
  };
}

export async function originalJobInputsCurrent(job: StoryFilmJob) {
  if (job.mode !== "original") return true;
  if (job.preparation !== "automatic") {
    const edit = await getOriginalFilmEdit(job.collectionId);
    if (edit?.revisionHash !== job.originalPlanHash) return false;
  }
  for (const source of job.originalSources ?? []) {
    const media = await getMedia(source.mediaId);
    if (
      !media ||
      media.collectionId !== job.collectionId ||
      media.role !== "owner" ||
      sourceMetadataHash(media) !== source.metadataSha256
    )
      return false;
  }
  return Boolean(job.originalSources?.length);
}

export const AUTOMATIC_TEMPLATE_VERSION = "original-scribe-word-match-v2";
export async function prepareAutomaticJob(
  c: Collection,
  presentation: "video" | "audio" = "video",
) {
  const sourceSha256 = originalCollectionHash(c);
  const sources = await originalFilmSources(c);
  const snapshots: OriginalSourceSnapshot[] = [];
  for (const source of sources) {
    const media = await getMedia(source.mediaId);
    if (!media || media.collectionId !== c.id || media.role !== "owner")
      throw new Error("An original recording is unavailable.");
    snapshots.push({ ...source, metadataSha256: sourceMetadataHash(media) });
  }
  const chapters: FilmChapter[] = CHAPTERS.map(({ id }, index) => {
    const chapter = c.chapters.find((item) => item.id === id)!;
    const answers = selectedAnswers(c, id);
    if (
      !snapshots.some((source) => source.chapterIds.includes(id)) ||
      answers.some(
        (answer) =>
          !snapshots.some((source) => source.sourceTakeIds.includes(answer.id)),
      )
    )
      throw new Error(
        "Each of the four themes needs a saved original recording. Written answers remain available as stories.",
      );
    return {
      chapterId: id,
      chapterNumber: (index + 1) as 1 | 2 | 3 | 4,
      title: chapter.title,
      content: chapter.content,
      script: "",
      scriptSha256: sha256(chapter.content),
      sourceTakeIds: [...chapter.sourceTakeIds],
      sourceSha256: sha256(
        JSON.stringify({
          sourceSha256,
          chapterId: id,
          sources: snapshots.filter((source) => source.chapterIds.includes(id)),
        }),
      ),
      status: "queued",
      progress: 0,
    };
  });
  // Measured-duration cache may appear later. It must not create a new paid version.
  const versionHash = sha256(
    JSON.stringify({
      mode: "original",
      preparation: "automatic",
      sourceSha256,
      presentation,
      sources: snapshots.map(
        ({ durationMs: _durationMs, ...source }) => source,
      ),
      template: AUTOMATIC_TEMPLATE_VERSION,
    }),
  );
  return { sourceSha256, snapshots, chapters, versionHash };
}
