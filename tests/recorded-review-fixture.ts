import { randomUUID } from "node:crypto";
import type { Collection } from "../src/lib/collection/types";

/** Fictional stored outputs for API lifecycle tests. Does not render or call providers. */
export async function attachSyntheticOriginalFilms(collection: Collection) {
  const store = await import("../src/lib/collection/store");
  const jobs = await import("../src/lib/collection/films/jobstore");
  await store.putCollection(collection);
  const job = await jobs.enqueueAutomaticOriginalFilms(collection, {
    processingApproved: true,
  });
  job.status = "ready";
  for (const chapter of job.chapters) {
    const mediaId = randomUUID();
    await store.putMedia({
      id: mediaId,
      collectionId: collection.id,
      role: "owner",
      provenance: "generated_film",
      mimeType: "video/mp4",
      originalName: "synthetic-finished-film.mp4",
      bytes: 10,
      createdAt: collection.createdAt,
      localPath: "/synthetic-test-film",
    });
    const sources = job.originalSources!.filter((source) =>
      source.chapterIds.includes(chapter.chapterId),
    );
    chapter.status = "ready";
    chapter.progress = 1;
    chapter.artifact = {
      jobId: job.id,
      chapterId: chapter.chapterId,
      mediaId,
      narrationKind: "original_recording",
      presentation: "audio",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      outputSha256: String(chapter.chapterNumber).repeat(64),
      planSha256: "a".repeat(64),
      durationSeconds: 10,
      createdAt: collection.createdAt,
      sourceRanges: sources.map((source) => ({
        mediaId: source.mediaId,
        inMs: 0,
        outMs: 1000,
      })),
      sourceAssets: sources.map((source) => ({
        mediaId: source.mediaId,
        sha256: "b".repeat(64),
        durationMs: 1000,
      })),
    };
  }
  await store.mutateRecord(job.id, () => job);
  await jobs.attachReadyFilms(job);
  return (await store.getCollection(collection.id))!;
}

export function recordedApproval(collection: Collection) {
  return {
    recordingsReviewed: true,
    reviewedFilmHashes: Object.fromEntries(
      collection.chapters.map((chapter) => [
        chapter.id,
        chapter.film!.outputSha256,
      ]),
    ),
  };
}
