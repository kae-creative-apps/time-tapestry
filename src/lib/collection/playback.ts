import type { StoryPlaybackArtifact } from "../audio/playback-types";
import { sha256 } from "./films/plan";
import { CHAPTERS } from "../interview-state";
import { getMedia, mutateCollection } from "./store";
import {
  getFilmJob,
  latestFilmJob,
  filmJobInputsCurrent,
} from "./films/jobstore";
import { appOrigin, linksFor } from "./access";
import type { Collection } from "./types";
import type { StoryFilmJob } from "./films/types";
import { hasChapterPlayback } from "../audio/playback-types";
export { hasChapterPlayback } from "../audio/playback-types";
export const playbackExportJobId = (sourceJobId: string) =>
  `film_${sha256(`${sourceJobId}:mp4-export-v1`)}`;
export const playbackMediaId = (p: StoryPlaybackArtifact) =>
  `playbackmedia_${sha256(`${p.jobId}:${p.chapterId}:${p.outputSha256}`).slice(0, 48)}`;
export const playbackExportMediaId = (p: StoryPlaybackArtifact) =>
  p.exportSha256
    ? `filmmedia_${sha256(`${playbackExportJobId(p.jobId)}:${p.chapterId}:${p.exportSha256}`).slice(0, 48)}`
    : undefined;

/** Compare the full approved timeline, not just the audio output hash. Exports may attach later. */
function samePlayback(a: StoryPlaybackArtifact, b: StoryPlaybackArtifact) {
  const { exportMediaId: aExport, exportSha256: aHash, ...left } = a;
  const { exportMediaId: bExport, exportSha256: bHash, ...right } = b;
  void aExport;
  void aHash;
  void bExport;
  void bHash;
  return JSON.stringify(left) === JSON.stringify(right);
}
export function playbackJobMatchesCollection(job: StoryFilmJob, c: Collection) {
  return Boolean(
    job.sourceJobId &&
    job.id === playbackExportJobId(job.sourceJobId) &&
    job.outputMode === "mp4" &&
    c.chapters.length === 4 &&
    job.chapters.length === 4 &&
    CHAPTERS.every(({ id }) => {
      const chapter = c.chapters.find((item) => item.id === id);
      const saved = job.chapters.find(
        (item) => item.chapterId === id,
      )?.playback;
      return (
        chapter?.playback &&
        saved &&
        chapter.playback.jobId === job.sourceJobId &&
        samePlayback(chapter.playback, saved)
      );
    }),
  );
}
async function chapterPlaybackStored(
  c: Collection,
  job: StoryFilmJob,
  chapter: Collection["chapters"][number],
) {
  const p = chapter.playback;
  if (!p) return false;
  const saved = job.chapters.find((item) => item.chapterId === chapter.id);
  const m = await getMedia(p.mediaId);
  return Boolean(
    saved?.playback &&
    saved.status === "ready" &&
    p.jobId === job.id &&
    samePlayback(p, saved.playback) &&
    p.mediaId === playbackMediaId(p) &&
    m &&
    m.collectionId === c.id &&
    m.role === "owner" &&
    m.provenance === "chapter_playback" &&
    m.mimeType === "audio/mp4" &&
    m.bytes > 0 &&
    (m.url || m.localPath),
  );
}

export async function playbackReady(c: Collection, job?: StoryFilmJob | null) {
  if (
    c.draftOutdated ||
    c.chapters.length !== 4 ||
    !CHAPTERS.every(({ id }) =>
      c.chapters.some(
        (chapter) => chapter.id === id && hasChapterPlayback(chapter),
      ),
    )
  )
    return false;
  const current = job ?? (await latestFilmJob(c.id));
  if (
    !current ||
    current.collectionId !== c.id ||
    current.mode !== "original" ||
    current.outputMode !== "interactive" ||
    current.chapters.length !== 4 ||
    !(await filmJobInputsCurrent(current, c))
  )
    return false;
  for (const chapter of c.chapters) {
    if (!(await chapterPlaybackStored(c, current, chapter))) return false;
  }
  return true;
}
export async function playbackExportReady(c: Collection, job: StoryFilmJob) {
  if (
    job.status !== "ready" ||
    !playbackJobMatchesCollection(job, c) ||
    (await latestFilmJob(c.id))?.id !== job.sourceJobId ||
    !(await filmJobInputsCurrent(job, c))
  )
    return false;
  for (const chapter of c.chapters) {
    const p = chapter.playback!;
    const artifact = job.chapters.find(
      (item) => item.chapterId === chapter.id,
    )?.artifact;
    const media = p.exportMediaId ? await getMedia(p.exportMediaId) : null;
    if (
      !artifact ||
      artifact.narrationKind !== "original_recording" ||
      artifact.jobId !== job.id ||
      artifact.chapterId !== chapter.id ||
      artifact.mediaId !== p.exportMediaId ||
      artifact.outputSha256 !== p.exportSha256 ||
      p.exportMediaId !== playbackExportMediaId(p) ||
      !media ||
      media.collectionId !== c.id ||
      media.role !== "owner" ||
      media.provenance !== "generated_film" ||
      media.mimeType !== "video/mp4" ||
      media.bytes <= 0 ||
      !(media.url || media.localPath)
    )
      return false;
  }
  return true;
}
export async function attachChapterPlayback(job: StoryFilmJob) {
  if (job.outputMode !== "interactive" || job.chapters.length !== 4)
    throw new Error("This chapter preparation is incomplete.");
  const finished = job.chapters.filter((chapter) => chapter.playback);
  if (!finished.length) return;
  return mutateCollection(job.collectionId, async (c) => {
    const latest = await getFilmJob(job.id);
    if (
      !latest ||
      (latest.status !== "ready" &&
        (!job.lease ||
          latest.lease?.token !== job.lease.token ||
          latest.lease.expiresAt <= Date.now())) ||
      (await latestFilmJob(c.id))?.id !== job.id ||
      !(await filmJobInputsCurrent(job, c))
    )
      throw new Error("This chapter preparation was replaced.");
    if (c.status === "approved") {
      if (
        c.chapters.every((chapter) => {
          const prepared = job.chapters.find(
            (item) => item.chapterId === chapter.id,
          )?.playback;
          return (
            chapter.playback &&
            prepared &&
            samePlayback(chapter.playback, prepared)
          );
        })
      )
        return c;
      throw new Error("Approved chapter playback cannot be replaced.");
    }
    for (const item of finished) {
      const target = c.chapters.find(
        (chapter) => chapter.id === item.chapterId,
      );
      if (!target) throw new Error("A prepared chapter is missing.");
      // A checkpoint retry must preserve review marks and exports on the exact same audio timeline.
      if (
        target.playback &&
        item.playback &&
        samePlayback(target.playback, item.playback)
      )
        continue;
      target.playback = item.playback;
      target.editorialReviewed = false;
      target.reviewedPlaybackSha256 = undefined;
    }
    for (const item of finished) {
      const target = c.chapters.find(
        (chapter) => chapter.id === item.chapterId,
      );
      if (!target || !(await chapterPlaybackStored(c, job, target)))
        throw new Error("Chapter playback storage verification failed.");
    }
    if (!(await playbackReady(c, job))) return c;
    const id = `${c.id}:playback-ready:${job.id}`;
    if (!c.notifications.some((notice) => notice.id === id))
      c.notifications.push({
        id,
        kind: "review_ready",
        to: c.storyteller.email,
        subject: "Your Time Tapestry stories are ready",
        text: "Your four chapters and story book are ready. Listen in your own recorded voice, personalize your postcards, and approve sharing your gift. You can request downloadable videos from your collection.",
        url: appOrigin() + linksFor(c).review,
        dueAt: new Date().toISOString(),
        status: "pending",
      });
    return c;
  });
}
