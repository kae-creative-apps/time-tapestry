export type PlaybackWord = { text: string; startMs: number; endMs: number };
/** Only the chapter-only derivative is delivered to a recipient, never source URLs. */
export type StoryPlaybackArtifact = {
  schemaVersion: 1;
  jobId: string;
  chapterId: string;
  mediaId: string;
  sourceTakeIds: string[];
  sourceSha256: string;
  planSha256: string;
  outputSha256: string;
  durationMs: number;
  words: PlaybackWord[];
  createdAt: string;
  exportMediaId?: string;
  exportSha256?: string;
};

/** Rendering hint only. Server authorization verifies the stored job and media. */
export function hasChapterPlayback(chapter: {
  id: string;
  playback?: StoryPlaybackArtifact;
}): boolean {
  const playback = chapter.playback;
  return Boolean(
    playback &&
    playback.schemaVersion === 1 &&
    playback.chapterId === chapter.id &&
    playback.mediaId.startsWith("playbackmedia_") &&
    /^[a-f0-9]{64}$/.test(playback.outputSha256) &&
    Number.isFinite(playback.durationMs) &&
    playback.durationMs > 0,
  );
}
