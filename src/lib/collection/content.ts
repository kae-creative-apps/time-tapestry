import { CHAPTERS } from "../interview-state";
import { chat } from "../gloo-client";
import type { Collection, ChapterPackage } from "./types";
import { interviewAnswers } from "./interview";
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
      .map((a) => a.text.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!source)
      throw new Error(
        `Save a written answer or finish transcription for part ${chapters.length + 1} before creating your story.`,
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
export function addCalendarMonths(iso: string, months: number) {
  const original = new Date(iso);
  if (!Number.isFinite(original.getTime()))
    throw new Error("Invalid schedule date");
  const target = new Date(original);
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString();
}
export function approveCollection(
  c: Collection,
  now = new Date().toISOString(),
  options: {
    deliveryMode?: "digital" | "postal";
    allowWrittenOnly?: boolean;
  } = {},
): Collection {
  if (c.status === "approved") return c;
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
        !ch.editorialReviewed ||
        (ch.videoStatus === "awaiting_edit" && !options.allowWrittenOnly) ||
        (Boolean(ch.film) && ch.reviewedFilmSha256 !== ch.film?.outputSha256) ||
        (ch.videoStatus === "ready" && !ch.videoMediaId),
    )
  )
    throw new Error(
      "Review all four stories and finish or remove pending video edits before approval.",
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
    status: "approved",
    approvedAt: now,
    approvedVersion: 1,
    deliveries:
      options.deliveryMode === "digital"
        ? []
        : c.chapters.map((ch, i) => ({
            chapterId: ch.id,
            scheduledFor: addCalendarMonths(now, i * 3),
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
  // Reuse the approval checks against the exact approved version.
  const scheduled = approveCollection({ ...c, status: "draft" }, now, {
    deliveryMode: "postal",
    allowWrittenOnly: true,
  });
  return { ...c, deliveries: scheduled.deliveries };
}
