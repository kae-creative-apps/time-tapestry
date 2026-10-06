import { CHAPTERS } from "../interview-state";
import { chat } from "../gloo-client";
import type { Collection, ChapterPackage } from "./types";
import { interviewAnswers } from "./interview";
import { cleanTranscriptForReading } from "./transcript-reading";
import { postcardScheduledDate } from "./postcard-cadence";
import { hasChapterPlayback } from "../audio/playback-types";
export { addCalendarMonths } from "./postcard-cadence";
import {
  POSTCARD_NOTE_LIMIT,
  STORY_EDITOR_INPUT_LIMIT,
  readStoryEditorDraft,
  storyEditorMessages,
  type StoryEditorRequest,
} from "./story-editorial";

export function selectedAnswers(c: Collection, chapterId: string) {
  return [
    ...c.takes.filter(
      (t) =>
        (t.questionId === chapterId ||
          t.questionId.startsWith(`${chapterId}-f`)) &&
        c.selectedTakeIds[t.questionId] === t.id,
    ),
    ...interviewAnswers(c, chapterId),
  ];
}
export async function draftChapters(
  c: Collection,
  request: StoryEditorRequest = chat,
): Promise<ChapterPackage[]> {
  const chapters: ChapterPackage[] = [];
  for (const config of CHAPTERS) {
    const answers = selectedAnswers(c, config.id);
    const source = answers
      .map((a) => cleanTranscriptForReading(a.text).text.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!source)
      throw new Error(
        `Record your answer and finish transcription for part ${chapters.length + 1} before preparing your films.`,
      );
    let content = source;
    let note =
      source.length <= POSTCARD_NOTE_LIMIT
        ? source
        : `${source.slice(0, POSTCARD_NOTE_LIMIT - 3).trimEnd()}...`;
    let generatedWith: ChapterPackage["generatedWith"] = "source_text";
    const messages = storyEditorMessages(config.title, answers);
    // Keep the entire source draft for long chapters. Never crop the input or
    // ask the model to compress it to a smaller output budget.
    if (
      process.env.GLOO_API_KEY &&
      messages[1].content.length <= STORY_EDITOR_INPUT_LIMIT
    ) {
      const response = await request(messages);
      try {
        const draft = readStoryEditorDraft(response, answers);
        content = draft.content;
        note = draft.postcardNote;
        generatedWith = "gloo";
      } catch {
        throw new Error(
          "The story editor returned an incomplete draft. Your original answers are saved. Please retry.",
        );
      }
    }
    chapters.push({
      id: config.id,
      title: config.title,
      content,
      postcardNote: note,
      sourceTakeIds: answers.map((a) => a.id),
      videoStatus: answers.some(
        (a) => a.mediaId || a.liveSource?.sourceRanges.length,
      )
        ? "awaiting_edit"
        : "not_requested",
      editorialReviewed: false,
      generatedWith,
    });
  }
  return chapters;
}
export function approveCollection(
  c: Collection,
  now = new Date().toISOString(),
  options: {
    deliveryMode?: "digital" | "postal";
    allowWrittenOnly?: boolean;
    recordingsReviewed?: boolean;
    reviewedFilmHashes?: Record<string, string>;
    reviewedPlaybackHashes?: Record<string, string>;
  } = {},
): Collection {
  if (c.status === "approved") return c;
  if (c.storyIssues?.some((issue) => issue.status === "open"))
    throw new Error(
      "A story detail is being checked. Review the corrected version before sharing your gift.",
    );
  if (options.recordingsReviewed !== true)
    throw new Error(
      "Review your four recorded chapters before approving your collection.",
    );
  if (
    c.chapters.length !== 4 ||
    CHAPTERS.some(({ id }) => {
      const ch = c.chapters.find((chapter) => chapter.id === id);
      const film = ch?.film;
      const answers = selectedAnswers(c, id);
      const playback = ch?.playback;
      const playbackApproved = Boolean(
        ch &&
        hasChapterPlayback(ch) &&
        playback &&
        options.reviewedPlaybackHashes?.[id] === playback.outputSha256 &&
        playback.sourceTakeIds.length === ch.sourceTakeIds.length &&
        ch.sourceTakeIds.every((takeId) =>
          playback.sourceTakeIds.includes(takeId),
        ),
      );
      const filmApproved = Boolean(
        ch &&
        film &&
        ch.videoStatus === "ready" &&
        film.narrationKind === "original_recording" &&
        film.chapterId === id &&
        ch.videoMediaId === film.mediaId &&
        /^[a-f0-9]{64}$/i.test(film.outputSha256) &&
        options.reviewedFilmHashes?.[id] === film.outputSha256 &&
        film.sourceTakeIds.length === ch.sourceTakeIds.length &&
        ch.sourceTakeIds.every((takeId) => film.sourceTakeIds.includes(takeId)),
      );
      return (
        !ch ||
        (!playbackApproved && !filmApproved) ||
        !answers.length ||
        answers.length !== ch.sourceTakeIds.length ||
        answers.some(
          (answer) =>
            answer.kind === "text" || !ch.sourceTakeIds.includes(answer.id),
        )
      );
    })
  )
    throw new Error(
      "Review all four current chapters and approve their latest versions together.",
    );
  if (c.draftOutdated)
    throw new Error(
      "Your selected answers changed. Recreate the written draft and review the new version before approval.",
    );
  if (
    c.chapters.length !== 4 ||
    c.chapters.some(
      (ch) =>
        !ch.content.trim() ||
        !ch.postcardNote.trim() ||
        (!hasChapterPlayback(ch) &&
          ch.videoStatus === "ready" &&
          !ch.videoMediaId),
    )
  )
    throw new Error(
      "Finish preparing all four recorded chapters before approval.",
    );
  if (
    c.chapters.some((ch) => {
      const b = c.chapterBlessings[ch.id];
      return (
        ch.postcardNote.length +
          (b?.encouragement.length || 0) +
          (b?.scriptureReference.length || 0) +
          (b?.scriptureText.length || 0) +
          (b?.scriptureTranslation.length || 0) >
        1000
      );
    })
  )
    throw new Error(
      "Shorten postcard notes and encouragement to 1,000 characters total per card.",
    );
  if (options.deliveryMode !== "digital" && (!c.addressConfirmed || !c.address))
    throw new Error(
      "Confirm the recipient mailing address before approving the first postcard.",
    );
  return {
    ...c,
    chapters: c.chapters.map((chapter) => ({
      ...chapter,
      editorialReviewed: true,
      ...(chapter.playback &&
      options.reviewedPlaybackHashes?.[chapter.id] ===
        chapter.playback.outputSha256
        ? { reviewedPlaybackSha256: chapter.playback.outputSha256 }
        : { reviewedFilmSha256: chapter.film!.outputSha256 }),
    })),
    status: "approved",
    approvedAt: now,
    approvedVersion: 1,
    deliveries:
      options.deliveryMode === "digital"
        ? []
        : c.chapters.map((ch, i) => ({
            chapterId: ch.id,
            scheduledFor: postcardScheduledDate(c, now, i),
            status: "scheduled",
          })),
  };
}

/** Postal delivery is a separate, explicit choice after digital approval. */
export function schedulePostcards(
  c: Collection,
  now = new Date().toISOString(),
): Collection {
  if (c.status !== "approved")
    throw new Error("Approve your stories before scheduling postcards.");
  if (c.deliveries.length) return c;
  if (!c.addressConfirmed || !c.address)
    throw new Error("Confirm the recipient mailing address first.");
  // Mailing an already approved immutable collection does not ask the owner
  // to approve again or rewrite a historical approval under today's rules.
  const scheduled = {
    ...c,
    deliveries: c.chapters.map((chapter, index) => ({
      chapterId: chapter.id,
      scheduledFor: postcardScheduledDate(c, now, index),
      status: "scheduled" as const,
    })),
  };
  return { ...c, deliveries: scheduled.deliveries };
}
