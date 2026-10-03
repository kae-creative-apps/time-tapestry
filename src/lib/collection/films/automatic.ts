import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { selectedAnswers } from "../content";
import { getCollection } from "../store";
import { originalCollectionHash } from "./original-plan";
import { originalAudioCopy, stageOriginalSource } from "./source-media";
import { privateJson } from "./render";
import { sha256 } from "./plan";
import { transcribeOriginal } from "./transcription";
import {
  captionsForWords,
  cutsForMatchedWords,
  matchSourceWords,
  validateSourceWords,
  type SourceWord,
} from "./word-matching";
import type { FilmChapter, OriginalChapterEdit, StoryFilmJob } from "./types";

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
  await mkdir(path.join(root, "transcripts"), { recursive: true, mode: 0o700 });
  const wordsByMedia = new Map<string, SourceWord[]>(),
    durations = new Map<string, number>();
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
    const cacheKey = sha256(
      `${staged.originalSha256}:scribe_v2:word:diarize:v1`,
    );
    const cache = path.join(root, "transcripts", `${cacheKey}.json`);
    let words: SourceWord[] | undefined;
    try {
      const saved = JSON.parse(await readFile(cache, "utf8"));
      if (
        saved.sourceSha256 === staged.originalSha256 &&
        saved.mediaId === source.mediaId
      )
        words = validateSourceWords(
          saved.words,
          staged.durationMs,
          source.mediaId,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!words) {
      // This is an extracted copy of the actual microphone track, never synthesis.
      const audio = await originalAudioCopy(staged, false);
      await assertCurrent();
      await privateJson(`${cache}.request.json`, {
        sourceSha256: staged.originalSha256,
        model: "scribe_v2",
        requestedAt: new Date().toISOString(),
        attempt: job.attempts,
      });
      words = await transcribe(audio.file, source.mediaId, staged.durationMs);
      await privateJson(cache, {
        sourceSha256: staged.originalSha256,
        mediaId: source.mediaId,
        model: "scribe_v2",
        words,
      });
      await assertCurrent();
    }
    wordsByMedia.set(source.mediaId, words);
    await progress("transcribing", (index + 1) / sources.length);
  }
  await progress("matching", 0);
  const edits = new Map(
    job.chapters.map((chapter) => [
      chapter.chapterId,
      {
        chapterId: chapter.chapterId,
        presentation: job.automaticPresentation ?? "video",
        clips: [],
      } as OriginalChapterEdit,
    ]),
  );
  const report: {
    sourceTakeIds: string[];
    chapterId: string;
    confidence: number;
  }[] = [];
  // Dedicated question recordings are already explicitly attributed. Preserve
  // the complete take, including natural pauses, and add actual word captions.
  for (const chapter of job.chapters) {
    for (const answer of selectedAnswers(c, chapter.chapterId).filter(
      (answer) => !answer.liveSource,
    )) {
      const source = sources.find(
        (item) =>
          item.mediaId === answer.mediaId &&
          item.sourceTakeIds.includes(answer.id),
      );
      if (!source)
        throw new Error(
          "An answer has no authorized original recording. Its written story is preserved.",
        );
      const words = wordsByMedia.get(source.mediaId)!;
      const speakers = new Set(
        words.map((word) => word.speakerId).filter(Boolean),
      );
      if (speakers.size > 1)
        throw new Error(
          "A question recording contains multiple detected speakers and needs an editor check.",
        );
      edits
        .get(chapter.chapterId)!
        .clips.push({
          mediaId: source.mediaId,
          inMs: 0,
          outMs: durations.get(source.mediaId)!,
          captions: captionsForWords(words),
        });
      report.push({
        sourceTakeIds: [answer.id],
        chapterId: chapter.chapterId,
        confidence: 1,
      });
    }
  }
  for (const session of c.interviews ?? []) {
    const accepted = new Map(
      job.chapters.flatMap((chapter) =>
        selectedAnswers(c, chapter.chapterId)
          .filter((answer) => answer.liveSource?.sessionId === session.id)
          .map((answer) => [answer.liveSource!.turnId, answer] as const),
      ),
    );
    const groups: {
      chapterId: string;
      texts: string[];
      takeIds: string[];
      mediaIds: Set<string>;
    }[] = [];
    for (const turn of [...session.turns].sort(
      (a, b) => a.sequence - b.sequence,
    )) {
      const answer = accepted.get(turn.id);
      if (!answer) continue;
      const chapterId = answer.liveSource!.chapterId;
      let group = groups.at(-1);
      if (!group || group.chapterId !== chapterId) {
        group = { chapterId, texts: [], takeIds: [], mediaIds: new Set() };
        groups.push(group);
      }
      group.texts.push(answer.text);
      group.takeIds.push(answer.id);
      for (const range of answer.liveSource!.sourceRanges)
        group.mediaIds.add(range.mediaId);
    }
    const orderedIds = [...session.segments]
      .sort((a, b) => a.startMs - b.startMs)
      .map((segment) => segment.mediaId);
    const allWords = [...new Set(orderedIds)].flatMap(
      (id) => wordsByMedia.get(id) ?? [],
    );
    let cursor = 0;
    for (const group of groups) {
      await assertCurrent();
      const candidates = allWords
        .slice(cursor)
        .filter((word) => group.mediaIds.has(word.mediaId));
      const match = matchSourceWords(group.texts.join(" "), candidates);
      const matchedClips = cutsForMatchedWords(
        match.words,
        allWords,
        durations,
      );
      edits.get(group.chapterId)!.clips.push(...matchedClips);
      cursor = allWords.indexOf(candidates[match.lastWordIndex]) + 1;
      report.push({
        sourceTakeIds: group.takeIds,
        chapterId: group.chapterId,
        confidence: match.confidence,
      });
    }
  }
  const chapters = job.chapters.map((chapter) => {
    const edit = edits.get(chapter.chapterId)!;
    if (!edit.clips.length || edit.clips.length > 40)
      throw new Error(
        "A theme could not be assembled into verified original clips. No incomplete four-film collection was attached.",
      );
    if (
      edit.clips.reduce((total, clip) => total + clip.outMs - clip.inMs, 7000) >
      3600000
    )
      throw new Error(
        "A complete original film exceeds the one-hour limit and needs an editor check.",
      );
    return {
      ...chapter,
      sourceEdit: edit,
      sourceSha256: sha256(
        JSON.stringify({ source: chapter.sourceSha256, edit, sourceHashes }),
      ),
      status: "preparing" as const,
      progress: 0,
    };
  });
  await privateJson(path.join(root, "automatic-source-plan.json"), {
    templateVersion: job.templateVersion,
    sourceHashes,
    edits: [...edits.values()],
    report,
    algorithm:
      "Saved user turns matched to actual Scribe word timestamps; no message-arrival cuts",
    finalOwnerReviewRequired: true,
  });
  await progress("matching", 1);
  return chapters;
}
