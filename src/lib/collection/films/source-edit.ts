import { selectedAnswers } from "../content";
import type { AnswerTake, Collection } from "../types";
import { sha256 } from "./plan";
import {
  captionsForWords,
  cutsForMatchedWords,
  matchSourceWords,
  sourceTokenCount,
  sessionWordTimeline,
  storytellerWords,
  type SourceWord,
} from "./word-matching";
import type { OriginalChapterEdit, StoryFilmJob } from "./types";
import {
  cleanSourcePassage,
  SOURCE_CLEANUP_VERSION,
  type SourceSilence,
} from "./source-cleanup";

const ANSWER_NOT_IN_RECORDING =
  /could not be matched confidently|boundaries could not be verified|more than once|did not preserve|smaller source search/;

function answerNotInRecording(error: Error) {
  return ANSWER_NOT_IN_RECORDING.test(error.message);
}

/** Logs the turn identity and matcher reason. Never the saved answer text. */
function logUnmatchedAnswer(answer: AnswerTake, error: Error) {
  console.info(
    JSON.stringify({
      event: "film_answer_not_in_recording",
      chapterId: answer.liveSource?.chapterId,
      turnId: answer.liveSource?.turnId,
      reason: error.message,
    }),
  );
}

export async function assembleSourceEdits(
  c: Collection,
  job: StoryFilmJob,
  wordsByMedia: Map<string, SourceWord[]>,
  durations: Map<string, number>,
  sourceHashes: { mediaId: string; sha256: string }[],
  assertCurrent: () => Promise<void> = async () => {},
  silenceByMedia: Map<string, SourceSilence[]> = new Map(),
) {
  const sources = job.originalSources ?? [];
  const edits = new Map(
    job.chapters.map((chapter) => [
      chapter.chapterId,
      {
        chapterId: chapter.chapterId,
        presentation: job.automaticPresentation ?? "video",
        clips: [],
        cleanup: { version: SOURCE_CLEANUP_VERSION, removed: [] },
      } as OriginalChapterEdit,
    ]),
  );
  const report: {
    sourceTakeIds: string[];
    chapterId: string;
    confidence: number;
  }[] = [];
  const originalClips = new Map<string, OriginalChapterEdit["clips"]>();
  const addPassage = (
    chapterId: string,
    clip: OriginalChapterEdit["clips"][number],
    words: SourceWord[],
  ) => {
    const preserved = originalClips.get(chapterId) ?? [];
    preserved.push(clip);
    originalClips.set(chapterId, preserved);
    const cleaned = cleanSourcePassage(
      clip,
      words,
      silenceByMedia.get(clip.mediaId) ?? [],
      job.outputMode === "interactive"
        ? { minimumSilenceMs: 1200, keepSilenceMs: 300 }
        : {},
    );
    const edit = edits.get(chapterId)!;
    edit.clips.push(...cleaned.clips);
    edit.cleanup!.removed.push(...cleaned.removed);
    if (cleaned.skippedReason)
      edit.cleanup!.skippedReason = cleaned.skippedReason;
  };
  // Dedicated question recordings are already explicitly attributed. Preserve
  // their complete meaning, using only verified word and waveform boundaries.
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
      const words = storytellerWords(wordsByMedia.get(source.mediaId)!);
      addPassage(
        chapter.chapterId,
        {
          mediaId: source.mediaId,
          inMs: 0,
          outMs: durations.get(source.mediaId)!,
          captions: captionsForWords(words),
        },
        words,
      );
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
    const answers = [...session.turns]
      .sort((a, b) => a.sequence - b.sequence)
      .flatMap((turn) => {
        const answer = accepted.get(turn.id);
        return answer ? [answer] : [];
      });
    const { allWords, matchableWords } = sessionWordTimeline(
      session.segments,
      wordsByMedia,
      durations,
    );
    type Matched = ReturnType<typeof matchSourceWords> & {
      first: number;
      last: number;
    };
    const matches = new Map<number, Matched>();
    let cursor = 0;
    const matchAnswer = (
      index: number,
      from: number,
      until: number,
      allowShort = false,
    ) => {
      const answer = answers[index];
      const allowed = new Set(
        answer.liveSource!.sourceRanges.map((range) => range.mediaId),
      );
      const candidates = matchableWords
        .slice(from, until)
        .filter((word) => allowed.has(word.mediaId));
      const match = matchSourceWords(answer.text, candidates, {
        allowShort,
        // The room mix is one diarized speaker, so the interviewer is extra
        // words inside the recording rather than a second label.
        ignoreInsertions: true,
      });
      return {
        ...match,
        first: matchableWords.indexOf(candidates[match.firstWordIndex]),
        last: matchableWords.indexOf(candidates[match.lastWordIndex]),
      };
    };
    // Verify each complete answer separately. A theme-wide range could retain
    // an excluded answer, an interviewer prompt or a pause between answers.
    // An answer the recording does not contain is logged and skipped. The
    // cursor stays put so the next answer still searches from the last match.
    for (const [index, answer] of answers.entries()) {
      await assertCurrent();
      if (sourceTokenCount(answer.text) < 4) continue;
      try {
        const match = matchAnswer(index, cursor, matchableWords.length);
        matches.set(index, match);
        cursor = match.last + 1;
      } catch (error) {
        if (error instanceof Error && answerNotInRecording(error)) {
          logUnmatchedAnswer(answer, error);
          continue;
        }
        throw error;
      }
    }
    for (const [index, answer] of answers.entries()) {
      if (matches.has(index)) continue;
      await assertCurrent();
      const before = [...matches]
        .filter(([position]) => position < index)
        .sort((a, b) => b[0] - a[0])[0]?.[1];
      const after = [...matches]
        .filter(([position]) => position > index)
        .sort((a, b) => a[0] - b[0])[0]?.[1];
      if (!before && !after) {
        // A chapter retake is only that chapter. Its short answers are the
        // story, so they do not need a longer neighbor from another part.
        if (session.replacesChapterId) {
          try {
            matches.set(
              index,
              matchAnswer(index, 0, matchableWords.length, true),
            );
          } catch (error) {
            if (error instanceof Error && answerNotInRecording(error)) {
              logUnmatchedAnswer(answer, error);
              continue;
            }
            throw error;
          }
          continue;
        }
        throw new Error(
          "A short answer needs a verified neighboring answer before its source can be selected automatically.",
        );
      }
      let match: Matched;
      try {
        match = matchAnswer(
          index,
          before ? before.last + 1 : 0,
          after ? after.first : matchableWords.length,
          true,
        );
      } catch (error) {
        // A backchannel or fragment the recording does not contain must not
        // discard the verified answers around it.
        if (error instanceof Error && answerNotInRecording(error)) {
          logUnmatchedAnswer(answer, error);
          continue;
        }
        throw error;
      }
      // A common short answer such as 'yes' needs speaker evidence from a
      // verified neighbor in the same file. Labels are not identities across files.
      // A chapter retake is only that part, so its own short fragments do not
      // need a longer answer from another recording to prove the voice.
      if (!session.replacesChapterId) {
        for (const word of match.words) {
          const neighborWords = [
            ...(before?.words ?? []),
            ...(after?.words ?? []),
          ].filter((neighbor) => neighbor.mediaId === word.mediaId);
          if (
            !word.speakerId ||
            !neighborWords.some(
              (neighbor) => neighbor.speakerId === word.speakerId,
            )
          )
            throw new Error(
              "A short answer could not be verified as the neighboring storyteller's voice. Its original is preserved for review.",
            );
        }
      }
      matches.set(index, match);
    }
    for (const [index, answer] of answers.entries()) {
      const match = matches.get(index);
      if (!match) continue;
      const matchedClips = cutsForMatchedWords(
        match.words,
        allWords,
        durations,
      );
      for (const clip of matchedClips)
        addPassage(
          answer.liveSource!.chapterId,
          clip,
          match.words.filter(
            (word) =>
              word.mediaId === clip.mediaId &&
              word.startMs >= clip.inMs &&
              word.endMs <= clip.outMs,
          ),
        );
      report.push({
        sourceTakeIds: [answer.id],
        chapterId: answer.liveSource!.chapterId,
        confidence: match.confidence,
      });
    }
  }

  const chapters = job.chapters.map((chapter) => {
    const edit = edits.get(chapter.chapterId)!;
    if (edit.clips.length > 500) {
      edit.clips = originalClips.get(chapter.chapterId) ?? [];
      edit.cleanup = {
        version: SOURCE_CLEANUP_VERSION,
        removed: [],
        skippedReason: "clip_limit",
      };
    }
    if (edit.clips.length > 500)
      throw new Error(
        "A theme could not be assembled into verified original clips. No incomplete four-film collection was attached.",
      );
    if (!edit.clips.length)
      return {
        ...chapter,
        sourceEdit: undefined,
        status: "failed" as const,
        progress: 0,
        error:
          "This chapter's saved answers could not be matched to its original recording. No automatic cut was made.",
      };
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
  return { chapters, edits: [...edits.values()], report };
}
