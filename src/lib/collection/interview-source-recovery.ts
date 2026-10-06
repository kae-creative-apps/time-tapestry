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
  const speakers = new Set(
    unique.map(({ word }) => word.speakerId).filter(Boolean),
  );
  if (speakers.size > 1)
    throw new InterviewSourceRecoveryError(
      "The saved original contains more than one detected speaker. It needs a source review before words can be assigned to your stories. Your recording is preserved.",
    );
  const words = unique.map(({ word }) => word);
  const alreadySaved = new Set<number>();
  for (const turn of session.turns.filter(
    (turn) => turn.role === "user" && isMeaningfulInterviewSpeech(turn.text),
  )) {
    try {
      const matched = matchSourceWords(turn.text, words, { allowShort: true });
      for (
        let index = matched.firstWordIndex;
        index <= matched.lastWordIndex;
        index++
      )
        alreadySaved.add(index);
    } catch {
      // Unaligned excluded or existing words cannot safely be copied into a new included turn.
      throw new InterviewSourceRecoveryError(
        "Some saved or excluded words could not be matched to the original recording. A source review is needed before recovery can continue. Your recordings and choices are preserved.",
      );
    }
  }
  type Group = { chapterId?: InterviewChapterId; entries: typeof unique };
  const groups: Group[] = [];
  let current: Group | undefined;
  for (const [index, entry] of unique.entries()) {
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
    const id = `source-${hash(`${session.id}:${first.word.mediaId}:${first.word.startMs}:${last.word.endMs}:${text}`).slice(0, 48)}`;
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
  )
    throw new InterviewSourceRecoveryError(
      "The recovered interview needs an editor to organize its saved words. Your complete original and transcription are preserved.",
    );
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
