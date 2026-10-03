import type { LocalTake } from "./local-takes";
import type { InterviewSegment } from "./types";

export const ARCHIVE_SEGMENT_MS = 4 * 60 * 1000;

export type ArchiveLocalTake = LocalTake & {
  kind: "voice" | "video";
  archive: {
    version: 1;
    sessionId: string;
    sessionStartedAt: string;
    startMs: number;
    durationMs?: number;
    recovered?: boolean;
  };
};

export function isArchiveTake(take: LocalTake): take is ArchiveLocalTake {
  const archive = (take as Partial<ArchiveLocalTake>).archive;
  return (
    archive?.version === 1 &&
    typeof archive.sessionId === "string" &&
    Number.isFinite(archive.startMs) &&
    (take.kind === "voice" || take.kind === "video")
  );
}

export function archiveDurationMs(take: ArchiveLocalTake): number {
  return Math.max(
    0,
    take.archive.durationMs ?? Math.round((take.durationSeconds ?? 0) * 1000),
  );
}

export function archiveTimelineOffset(
  sessionStartedAt: string,
  now: number,
): number {
  const origin = Date.parse(sessionStartedAt);
  if (!Number.isFinite(origin))
    throw new Error("The interview start time is missing.");
  return Math.max(0, Math.round(now - origin));
}

export function archiveSegment(take: ArchiveLocalTake): InterviewSegment {
  if (!take.mediaId) throw new Error("This recording has not uploaded yet.");
  return {
    id: take.id,
    localTakeId: take.id,
    mediaId: take.mediaId,
    startMs: take.archive.startMs,
    durationMs: archiveDurationMs(take),
    kind: take.kind,
    createdAt: take.createdAt,
  };
}

// A successful media upload is not an acknowledged interview attachment.
// Keep the same segment identity when retrying a lost acknowledgement.
export async function acknowledgeArchive(
  take: ArchiveLocalTake,
  acknowledge: (segment: InterviewSegment) => Promise<void>,
): Promise<ArchiveLocalTake> {
  await acknowledge(archiveSegment(take));
  return { ...take, state: "backed_up", updatedAt: new Date().toISOString() };
}
