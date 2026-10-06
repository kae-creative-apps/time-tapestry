import path from "node:path";
import { dataRoot, getCollection } from "../store";
import { originalCollectionHash } from "./original-plan";
import { originalAudioCopy, stageOriginalSource } from "./source-media";
import { privateJson } from "./render";
import { assembleSourceEdits } from "./source-edit";
import { cachedSourceTranscript } from "./transcript-cache";
import { transcribeOriginal } from "./transcription";
import { type SourceWord } from "./word-matching";
import type { FilmChapter, StoryFilmJob } from "./types";
import { detectSourceSilence } from "./source-silence";
import type { SourceSilence } from "./source-cleanup";

type Transcriber = typeof transcribeOriginal;
export async function prepareAutomaticSources(
  job: StoryFilmJob,
  root: string,
  assertCurrent: () => Promise<void>,
  progress: (
    stage: "transcribing" | "matching",
    fraction: number,
  ) => Promise<void>,
  transcribe: Transcriber = transcribeOriginal,
): Promise<FilmChapter[]> {
  if (
    job.mode !== "original" ||
    job.preparation !== "automatic" ||
    !job.processingConsentAt
  )
    throw new Error("Original processing consent is required.");
  const c = await getCollection(job.collectionId);
  if (!c || originalCollectionHash(c) !== job.sourceSha256)
    throw new Error("The source stories changed before automatic preparation.");
  const wordsByMedia = new Map<string, SourceWord[]>(),
    durations = new Map<string, number>(),
    silenceByMedia = new Map<string, SourceSilence[]>();
  const sourceHashes: { mediaId: string; sha256: string }[] = [];
  const sources = job.originalSources ?? [];
  for (const [index, source] of sources.entries()) {
    await assertCurrent();
    const staged = await stageOriginalSource(job, source.mediaId, root);
    durations.set(source.mediaId, staged.durationMs);
    sourceHashes.push({
      mediaId: source.mediaId,
      sha256: staged.originalSha256,
    });
    const words = await cachedSourceTranscript({
      cacheRoot: path.join(dataRoot, "film-transcripts", job.collectionId),
      legacyRoot: path.join(root, "transcripts"),
      sourceSha256: staged.originalSha256,
      mediaId: source.mediaId,
      durationMs: staged.durationMs,
      attempt: job.attempts,
      request: async () => {
        // Extract the actual microphone track only if its verified transcript
        // is not already cached. This is never a synthesized voice.
        const audio = await originalAudioCopy(staged, false);
        await assertCurrent();
        return transcribe(audio.file, source.mediaId, staged.durationMs);
      },
    });
    await assertCurrent();
    wordsByMedia.set(source.mediaId, words);
    // Analyze the same unlevelled source clock as transcription. Extraction is
    // cached locally; it neither changes the original nor calls a provider.
    try {
      const waveform = await originalAudioCopy(staged, false);
      silenceByMedia.set(
        source.mediaId,
        await detectSourceSilence(waveform.file, staged.durationMs),
      );
    } catch {
      // Silence analysis is optional evidence, never a reason to guess a cut.
      silenceByMedia.set(source.mediaId, []);
    }
    await assertCurrent();
    await progress("transcribing", (index + 1) / sources.length);
  }
  await progress("matching", 0);
  const { chapters, edits, report } = await assembleSourceEdits(
    c,
    job,
    wordsByMedia,
    durations,
    sourceHashes,
    assertCurrent,
    silenceByMedia,
  );
  await privateJson(path.join(root, "automatic-source-plan.json"), {
    templateVersion: job.templateVersion,
    sourceHashes,
    edits,
    report,
    algorithm:
      "Saved user turns matched to source words; conservative timestamped filler cuts and waveform-confirmed long-pause shortening; no message-arrival cuts",
    finalOwnerReviewRequired: true,
  });
  await progress("matching", 1);
  return chapters;
}
