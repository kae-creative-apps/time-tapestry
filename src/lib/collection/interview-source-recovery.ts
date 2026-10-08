import path from "node:path";
import { createHash } from "node:crypto";
import {
  pipelineContext,
  withPipelineStage,
} from "../observability/pipeline-logger";
import { dataRoot, getMedia } from "./store";
import { isStoredOwnerRecording } from "./recording-validation";
import { detectInterviewThemeFromQuestion } from "./interview-progress";
import {
  interviewSessionNeedsTranscriptRecovery,
  isMeaningfulInterviewSpeech,
  RECOVERED_TURN_PREFIX,
} from "./interview-speech";
import { sourceMetadataHash } from "./films/original-plan";
import { stageOriginalSource, originalAudioCopy } from "./films/source-media";
import { cachedSourceTranscript } from "./films/transcript-cache";
import { transcribeOriginal } from "./films/transcription";
import {
  matchSourceWords,
  validateSourceWords,
  type SourceWord,
} from "./films/word-matching";
import type { StoryFilmJob } from "./films/types";
import type {
  Collection,
  InterviewChapterId,
  InterviewSegment,
  InterviewSession,
  InterviewTurn,
  StoredMedia,
} from "./types";

export class InterviewSourceRecoveryError extends Error {}
export type InterviewTranscriptSource = {
  segment: InterviewSegment;
  durationMs: number;
  words: SourceWord[];
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

type TimedSourceWord = {
  word: SourceWord;
  segment: InterviewSegment;
  startMs: number;
  endMs: number;
};

/** Prefer the speaker who matches saved answers, then a clear duration majority. */
function selectStorytellerEntries(
  entries: TimedSourceWord[],
  turns: InterviewTurn[],
): { entries: TimedSourceWord[]; filtered: boolean } | null {
  const speakers = [
    ...new Set(entries.map((entry) => entry.word.speakerId).filter(Boolean)),
  ] as string[];
  if (speakers.length <= 1) return { entries, filtered: false };
  const meaningful = turns.filter(
    (turn) => turn.role === "user" && isMeaningfulInterviewSpeech(turn.text),
  );
  const scores = new Map<string, number>();
  for (const speaker of speakers) {
    const words = entries
      .filter(
        (entry) => !entry.word.speakerId || entry.word.speakerId === speaker,
      )
      .map((entry) => entry.word);
    let hits = 0;
    for (const turn of meaningful) {
      try {
        // Same live tolerance as the film matcher: an ElevenLabs turn against a
        // scribe transcript, not a dedicated recording.
        matchSourceWords(turn.text, words, {
          allowShort: true,
          ignoreInsertions: true,
        });
        hits += 1;
      } catch {
        // This speaker does not contain that saved answer.
      }
    }
    scores.set(speaker, hits);
  }
  const rankedHits = [...scores.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  let chosen: string | null = null;
  if (
    rankedHits[0] &&
    rankedHits[0][1] > 0 &&
    (rankedHits.length < 2 || rankedHits[0][1] > rankedHits[1][1])
  )
    chosen = rankedHits[0][0];
  if (!chosen) {
    const weights = new Map<string, number>();
    for (const entry of entries) {
      const id = entry.word.speakerId;
      if (!id) continue;
      const span = entry.word.endMs - entry.word.startMs;
      weights.set(
        id,
        (weights.get(id) ?? 0) +
          (Number.isFinite(span) && span > 0 ? span : 1),
      );
    }
    const ranked = [...weights.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    );
    if (
      ranked[0] &&
      (ranked.length === 1 || ranked[0][1] >= ranked[1][1] * 1.5)
    )
      chosen = ranked[0][0];
  }
  if (!chosen) return null;
  return {
    filtered: true,
    entries: entries.filter(
      (entry) => !entry.word.speakerId || entry.word.speakerId === chosen,
    ),
  };
}

/** Word timestamps recover source text. Prompt times attribute topics only, never authorize an edit. */
export function recoverInterviewSourceWords(
  session: InterviewSession,
  sources: InterviewTranscriptSource[],
): InterviewTurn[] {
  const originalTurns = structuredClone(session.turns);
  const sessionStart = Date.parse(session.startedAt);
  const anchors = session.turns
    .flatMap((turn) => {
      const chapterId =
        turn.role === "agent"
          ? turn.providerTranscript && turn.chapterId
            ? turn.chapterId
            : detectInterviewThemeFromQuestion(turn.text)
          : null;
      const startMs = Date.parse(turn.capturedAt) - sessionStart;
      return chapterId && Number.isFinite(startMs) && startMs >= 0
        ? [{ chapterId, startMs }]
        : [];
    })
    .sort((a, b) => a.startMs - b.startMs);
  const timed = sources
    .flatMap(({ segment, words, durationMs }) =>
      words.length === 0
        ? []
        : validateSourceWords(words, durationMs, segment.mediaId).map(
            (word) => ({
              word,
              segment,
              startMs: segment.startMs + word.startMs,
              endMs: segment.startMs + word.endMs,
            }),
          ),
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  // Rollover segments can overlap. Deduplicate only the same lexical word on the same source clock.
  const unique = timed.filter(
    (entry, index) =>
      !timed
        .slice(Math.max(0, index - 30), index)
        .some(
          (previous) =>
            previous.word.mediaId !== entry.word.mediaId &&
            Math.abs(previous.startMs - entry.startMs) <= 150 &&
            Math.abs(previous.endMs - entry.endMs) <= 150 &&
            normalized(previous.word.text) === normalized(entry.word.text),
        ),
  );
  if (!unique.some(({ word }) => isMeaningfulInterviewSpeech(word.text)))
    throw new InterviewSourceRecoveryError(
      "The saved original did not contain recognizable speech. Your recording is preserved. Replay it before deciding whether another recording is needed.",
    );
  // A second voice, often the interviewer played through speakers, must not
  // stop the storyteller. Keep her speaker, or her saved answers.
  const selected = selectStorytellerEntries(unique, session.turns);
  if (!selected) return originalTurns;
  const spoken = selected.entries;
  if (
    selected.filtered &&
    !spoken.some(({ word }) => isMeaningfulInterviewSpeech(word.text))
  )
    return originalTurns;
  const words = spoken.map(({ word }) => word);
  // A chapter retake reaches recovery only while its saved answers are short
  // fragments. A fragment's match can span words it never says, so recover
  // the whole retake and keep out only left-out answers.
  const retake = Boolean(session.replacesChapterId);
  const superseded = new Set(
    session.turns.map((turn) => turn.supersedesTurnId).filter(Boolean),
  );
  const alreadySaved = new Set<number>();
  let matchedAny = false;
  let missedAny = false;
  for (const turn of session.turns.filter(
    (turn) =>
      turn.role === "user" &&
      isMeaningfulInterviewSpeech(turn.text) &&
      // A correction is the same speech. Its latest wording decides.
      !(retake && superseded.has(turn.id)),
  )) {
    const excluded = session.excludedTurnIds.includes(turn.id);
    try {
      const matched = matchSourceWords(turn.text, words, {
        allowShort: true,
        ignoreInsertions: true,
      });
      matchedAny = true;
      if (retake && !excluded) continue;
      for (
        let index = matched.firstWordIndex;
        index <= matched.lastWordIndex;
        index++
      )
        alreadySaved.add(index);
    } catch (error) {
      // The turn id is enough. The saved sentence stays on the interview.
      console.info(
        JSON.stringify({
          event: "interview_answer_not_in_recording",
          chapterId: turn.chapterId ?? null,
          turnId: turn.id,
          excluded,
          reason: error instanceof Error ? error.message : "unmatched",
        }),
      );
      // A second speaker can leave a saved answer unmatched. Keep every saved
      // answer and do not invent replacements from the other voice.
      if (selected.filtered) return originalTurns;
      // Left-out words that cannot be found cannot be kept out of a retake.
      if (retake && excluded) return originalTurns;
      missedAny = true;
    }
  }
  if (missedAny) {
    // Nothing in this recording lines up. Stop before a film is spent.
    if (!matchedAny)
      throw new InterviewSourceRecoveryError(
        "Some saved or excluded words could not be matched to the original recording. A source review is needed before recovery can continue. Your recordings and choices are preserved.",
      );
    // One missed answer must not block the others, and uncovered source words
    // must not be added back as a new copy of an excluded or unmatched answer.
    if (!retake) return originalTurns;
  }
  type Group = { chapterId?: InterviewChapterId; entries: typeof spoken };
  const groups: Group[] = [];
  let current: Group | undefined;
  for (const [index, entry] of spoken.entries()) {
    if (alreadySaved.has(index)) {
      current = undefined;
      continue;
    }
    const chapterId =
      session.replacesChapterId ??
      anchors.findLast((anchor) => anchor.startMs <= entry.startMs)?.chapterId;
    if (
      !current ||
      current.chapterId !== chapterId ||
      current.entries.at(-1)?.word.mediaId !== entry.word.mediaId ||
      current.entries.reduce(
        (length, item) => length + item.word.text.length + 1,
        0,
      ) > 5000
    ) {
      current = { chapterId, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  for (const group of groups) {
    const text = group.entries
      .map(({ word }) => word.text)
      .join(" ")
      .trim();
    if (!isMeaningfulInterviewSpeech(text)) continue;
    const first = group.entries[0],
      last = group.entries.at(-1)!;
    const id = `${RECOVERED_TURN_PREFIX}${hash(`${session.id}:${first.word.mediaId}:${first.word.startMs}:${last.word.endMs}:${text}`).slice(0, 48)}`;
    if (originalTurns.some((turn) => turn.id === id)) continue;
    originalTurns.push({
      id,
      role: "user",
      sequence: Math.max(-1, ...originalTurns.map((turn) => turn.sequence)) + 1,
      text,
      capturedAt: new Date(sessionStart + first.startMs).toISOString(),
      ...(group.chapterId ? { chapterId: group.chapterId } : {}),
      // Do not promote prompt arrival times into clip boundaries. The film matcher uses cached source words.
      timing: "unaligned",
    });
  }
  if (
    originalTurns.length > 300 ||
    originalTurns.reduce((length, turn) => length + turn.text.length, 0) >
      200000
  ) {
    if (selected.filtered) return session.turns;
    throw new InterviewSourceRecoveryError(
      "The recovered interview needs an editor to organize its saved words. Your complete original and transcription are preserved.",
    );
  }
  return originalTurns;
}

export async function recoverOriginalInterviewSpeech(
  collection: Collection,
  options: {
    processingApprovedAt: string;
    jobId: string;
    attempt: number;
    originalMedia: StoredMedia[];
    assertCurrent: () => Promise<void>;
    readSource?: (
      session: InterviewSession,
      segment: InterviewSegment,
      media: StoredMedia,
    ) => Promise<InterviewTranscriptSource>;
  },
): Promise<Collection> {
  if (!Number.isFinite(Date.parse(options.processingApprovedAt)))
    throw new InterviewSourceRecoveryError(
      "Confirm processing of your saved original before recovering its words.",
    );
  if (
    !/^[a-zA-Z0-9_-]{8,100}$/.test(collection.id) ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(options.jobId)
  )
    throw new InterviewSourceRecoveryError(
      "This saved recovery request needs a setup check.",
    );
  const copy = structuredClone(collection);
  for (const session of copy.interviews ?? []) {
    if (!interviewSessionNeedsTranscriptRecovery(session)) continue;
    const sources: InterviewTranscriptSource[] = [];
    for (const segment of session.segments) {
      await options.assertCurrent();
      const media = await getMedia(segment.mediaId);
      const snapshot = options.originalMedia.find(
        (item) => item.id === segment.mediaId,
      );
      if (
        !isStoredOwnerRecording(media, copy, segment.kind) ||
        !snapshot ||
        sourceMetadataHash(media) !== sourceMetadataHash(snapshot)
      )
        throw new InterviewSourceRecoveryError(
          "The saved original changed or does not belong to this interview. Recovery stopped without changing your recordings.",
        );
      if (options.readSource) {
        sources.push(await options.readSource(session, segment, media));
      } else {
        const metadataHash = sourceMetadataHash(media);
        const job: StoryFilmJob = {
          schemaVersion: 1,
          kind: "story-film-job",
          id: options.jobId,
          collectionId: copy.id,
          storytellerName: copy.storyteller.name,
          mode: "original",
          preparation: "automatic",
          processingConsentAt: options.processingApprovedAt,
          sourceSha256: metadataHash,
          versionHash: metadataHash,
          templateVersion: "interview-source-recovery-v1",
          status: "preparing",
          chapters: [],
          createdAt: session.startedAt,
          updatedAt: new Date().toISOString(),
          scriptsApprovedAt: options.processingApprovedAt,
          attempts: options.attempt,
          originalSources: [
            {
              mediaId: media.id,
              kind: segment.kind === "video" ? "video" : "audio",
              durationMs: null,
              createdAt: media.createdAt,
              fromInterview: true,
              chapterIds: [],
              sourceTakeIds: [],
              metadataSha256: metadataHash,
            },
          ],
        };
        const root = path.join(
          dataRoot,
          "interview-source-recovery",
          copy.id,
          options.jobId,
        );
        const staged = await stageOriginalSource(job, media.id, root).catch(
          (error: unknown) => {
            if (error instanceof Error && /no audio track/.test(error.message))
              throw new InterviewSourceRecoveryError(
                "The saved original has no audio track. Its video is preserved. Replay it before deciding whether another recording is needed.",
              );
            throw error;
          },
        );
        await options.assertCurrent();
        try {
          const words = await cachedSourceTranscript({
            cacheRoot: path.join(dataRoot, "film-transcripts", copy.id),
            sourceSha256: staged.originalSha256,
            mediaId: media.id,
            durationMs: staged.durationMs,
            attempt: options.attempt,
            request: async () => {
              const audio = await originalAudioCopy(staged, false);
              await options.assertCurrent();
              return withPipelineStage(
                "TRANSCRIPTION",
                pipelineContext(copy.id),
                () =>
                  transcribeOriginal(audio.file, media.id, staged.durationMs),
                "elevenlabs",
              );
            },
          });
          sources.push({ segment, durationMs: staged.durationMs, words });
        } catch (error) {
          if (
            error instanceof Error &&
            /did not contain usable source words|Missing source word timestamps/.test(
              error.message,
            )
          )
            throw new InterviewSourceRecoveryError(
              "The saved original did not return recognizable speech. Your recording is preserved. Replay it before deciding whether another recording is needed.",
            );
          throw error;
        }
      }
      await options.assertCurrent();
    }
    session.turns = recoverInterviewSourceWords(session, sources);
  }
  return copy;
}
