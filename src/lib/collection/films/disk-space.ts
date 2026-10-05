import { statfs } from "node:fs/promises";

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

export class FilmDiskSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilmDiskSpaceError";
  }
}

/** Keep 1 GiB free for metadata and shutdown. Override with a positive integer
 * STORY_FILM_MIN_FREE_BYTES. This is a safety floor, not a storage quota. */
export function filmMinimumFreeBytes() {
  const configured = process.env.STORY_FILM_MIN_FREE_BYTES;
  const bytes = configured === undefined ? GiB : Number(configured);
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new FilmDiskSpaceError(
      "Film worker paused: STORY_FILM_MIN_FREE_BYTES must be a positive integer. Existing work is preserved.",
    );
  return bytes;
}

/** Original + possible seekable remux, and two stereo 48 kHz PCM derivatives.
 * Unknown duration reserves the existing two-hour source limit. Deliberately
 * count cached files again: free space is safer than assuming a cache is valid.
 * These estimates need benchmarking for real footage and are not a hard cap. */
export function filmSourceScratchBytes(
  sources: { bytes: number; durationMs: number | null }[],
) {
  let bytes = 0;
  for (const source of sources) {
    if (!Number.isSafeInteger(source.bytes) || source.bytes < 0)
      throw new FilmDiskSpaceError(
        "Film worker paused: a recording size could not be verified. Existing work is preserved.",
      );
    const seconds =
      source.durationMs !== null &&
      Number.isFinite(source.durationMs) &&
      source.durationMs > 0
        ? source.durationMs / 1000
        : 2 * 60 * 60;
    bytes += source.bytes * 2 + Math.ceil(seconds * 48000 * 2 * 2 * 2);
  }
  return Math.ceil(bytes);
}

/** Allow 4 MiB per second for encoded output and render intermediates. Remotion
 * scratch is content-dependent, so the free-space floor is also polled during
 * rendering. The worker's TMPDIR should share the guarded data volume. */
export function filmRenderScratchBytes(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new FilmDiskSpaceError(
      "Film worker paused: render space could not be estimated. Existing work is preserved.",
    );
  return Math.ceil(durationSeconds * 4 * MiB);
}

type Space = { bavail: number; bsize: number };

export async function assertFilmDiskSpace(
  directory: string,
  additionalBytes = 0,
  readSpace: (directory: string) => Promise<Space> = statfs,
) {
  const requiredBytes = filmMinimumFreeBytes() + additionalBytes;
  if (!Number.isSafeInteger(requiredBytes) || additionalBytes < 0)
    throw new FilmDiskSpaceError(
      "Film worker paused: scratch space could not be estimated. Existing work is preserved.",
    );
  let availableBytes: number;
  try {
    const space = await readSpace(directory);
    // bavail excludes reserved blocks that this worker cannot use.
    availableBytes = space.bavail * space.bsize;
    if (!Number.isSafeInteger(availableBytes) || availableBytes < 0)
      throw new Error("Invalid available space.");
  } catch {
    throw new FilmDiskSpaceError(
      `Film worker paused: free space on ${directory} could not be checked. Existing work is preserved.`,
    );
  }
  if (availableBytes < requiredBytes)
    throw new FilmDiskSpaceError(
      `Film worker paused for disk space: ${(availableBytes / GiB).toFixed(2)} GiB available on ${directory}; ${(requiredBytes / GiB).toFixed(2)} GiB required including the safety floor. Existing work is preserved.`,
    );
  return { availableBytes, requiredBytes };
}
