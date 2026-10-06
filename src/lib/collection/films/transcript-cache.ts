import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { privateJson } from "./media-files";
import { sha256 } from "./plan";
import { validateSourceWords, type SourceWord } from "./word-matching";

export const sourceTranscriptKey = (sourceSha256: string) =>
  sha256(`${sourceSha256}:scribe_v2:word:diarize:v1`);

/** Caller has already authorized and hashed the actual source. A byte-identical
 * source can have another upload ID without requiring another paid transcript.
 * The cache belongs to one collection, and stays private on worker storage.
 */
export async function cachedSourceTranscript(options: {
  cacheRoot: string;
  legacyRoot?: string;
  sourceSha256: string;
  mediaId: string;
  durationMs: number;
  attempt: number;
  request: () => Promise<SourceWord[]>;
}) {
  const key = sourceTranscriptKey(options.sourceSha256);
  const file = path.join(options.cacheRoot, `${key}.json`);
  await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
  const candidates = [
    file,
    ...(options.legacyRoot
      ? [path.join(options.legacyRoot, `${key}.json`)]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      const saved = JSON.parse(await readFile(candidate, "utf8"));
      if (
        saved.sourceSha256 !== options.sourceSha256 ||
        !Array.isArray(saved.words)
      )
        throw new Error(
          "A source transcription cache failed verification. Its original is preserved.",
        );
      const words = validateSourceWords(
        saved.words.map((word: SourceWord) => ({
          ...word,
          mediaId: options.mediaId,
        })),
        options.durationMs,
        options.mediaId,
      );
      if (candidate !== file) await privateJson(file, saved);
      return words;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await privateJson(`${file}.request.json`, {
    sourceSha256: options.sourceSha256,
    model: "scribe_v2",
    requestedAt: new Date().toISOString(),
    attempt: options.attempt,
  });
  const words = validateSourceWords(
    await options.request(),
    options.durationMs,
    options.mediaId,
  );
  await privateJson(file, {
    sourceSha256: options.sourceSha256,
    model: "scribe_v2",
    words,
  });
  return words;
}
