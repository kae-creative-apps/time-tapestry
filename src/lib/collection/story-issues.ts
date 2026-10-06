import { createHash, randomUUID } from "node:crypto";
import { selectedAnswers } from "./content";
import {
  getCollection,
  getMedia,
  putMedia,
  mutateCollection,
  mutateRecord,
  readRecord,
} from "./store";
import {
  hasRecordedAnswerSource,
  preserveGeneratedFilmProvenance,
} from "./recording-validation";
import { SecurityError } from "../security/policy";
import {
  enqueueAutomaticOriginalFilms,
  attachReadyFilms,
  latestFilmJob,
} from "./films/jobstore";
import { getInterviewPreparationJob } from "./interview-preparation";
import type { ChapterPackage, Collection } from "./types";

export type StoryIssue = NonNullable<Collection["storyIssues"]>[number];
const categories = ["name", "detail", "missing_context", "other"] as const;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_ISSUES = 100;
function chapterFor(c: Collection, id: unknown) {
  const chapter =
    typeof id === "string" && c.chapters.find((item) => item.id === id);
  if (!chapter)
    throw new SecurityError("Choose one of your saved story chapters.", 400);
  return chapter;
}
function requireDraft(c: Collection) {
  if (c.status === "approved")
    throw new SecurityError(
      "This gift has already been approved. Its published stories are unchanged.",
      409,
    );
  if (c.status !== "draft" || c.draftOutdated)
    throw new SecurityError(
      "Wait for the current story drafts before reporting a detail.",
      409,
    );
}
export function storySourceHash(c: Collection, chapterId: string) {
  return hash(
    selectedAnswers(c, chapterId).map((answer) => ({
      id: answer.id,
      prompt: answer.prompt,
      text: answer.text,
      kind: answer.kind,
      mediaId: answer.mediaId,
      liveSource: answer.liveSource,
    })),
  );
}
export function storyChapterHash(c: Collection, chapter: ChapterPackage) {
  return hash({
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    postcardNote: chapter.postcardNote,
    sourceTakeIds: chapter.sourceTakeIds,
    sourceHash: storySourceHash(c, chapter.id),
  });
}
export function storyIssueView(c: Collection) {
  return {
    issues: c.storyIssues ?? [],
    chapters: c.chapters.map((chapter) => ({
      id: chapter.id,
      hash: storyChapterHash(c, chapter),
    })),
  };
}
export function applyStoryIssue(c: Collection, input: Record<string, unknown>) {
  requireDraft(c);
  if (input.action === "withdraw") {
    if (Object.keys(input).some((key) => !["action", "issueId"].includes(key)))
      throw new SecurityError("Only the report can be withdrawn here.", 400);
    const issue = c.storyIssues?.find((item) => item.id === input.issueId);
    if (!issue) throw new SecurityError("This report could not be found.", 404);
    if (issue.status === "resolved")
      throw new SecurityError(
        "This detail has already been checked. Review the latest story.",
        409,
      );
    if (issue.status === "open") {
      issue.status = "withdrawn";
      issue.resolvedAt = new Date().toISOString();
    }
    return c;
  }
  if (input.action !== undefined && input.action !== "report")
    throw new SecurityError("Choose a report action.", 400);
  if (
    Object.keys(input).some(
      (key) =>
        !["action", "chapterId", "category", "expectedChapterHash"].includes(
          key,
        ),
    )
  )
    throw new SecurityError(
      "Story wording cannot be edited here. Choose the detail to check.",
      400,
    );
  const chapter = chapterFor(c, input.chapterId);
  if (!categories.includes(input.category as StoryIssue["category"]))
    throw new SecurityError("Choose the kind of detail to check.", 400);
  const chapterHash = storyChapterHash(c, chapter);
  if (
    input.expectedChapterHash !== undefined &&
    input.expectedChapterHash !== chapterHash
  )
    throw new SecurityError(
      "This story changed. Refresh and review the current version before reporting.",
      409,
    );
  c.storyIssues ??= [];
  if (
    c.storyIssues.some(
      (issue) =>
        issue.status === "open" &&
        issue.chapterHash === chapterHash &&
        issue.category === input.category,
    )
  )
    return c;
  if (c.storyIssues.length >= MAX_ISSUES)
    throw new SecurityError(
      "Please contact the Time Tapestry team to check the remaining details.",
      409,
    );
  c.storyIssues.push({
    id: randomUUID(),
    chapterId: chapter.id,
    category: input.category as StoryIssue["category"],
    createdAt: new Date().toISOString(),
    chapterHash,
    status: "open",
  });
  return c;
}

/** Private operator file. Never accepted from an owner-facing endpoint. */
export type StoryCorrection = {
  collectionId: string;
  issueId: string;
  expectedChapterHash: string;
  expectedIssueHash: string;
  expectedSourceHash: string;
  content: string;
  sourceReviewed: true;
  evidence: Array<{ takeId: string; quote: string }>;
};
type CorrectionAudit = {
  recordType: "story-source-correction";
  id: string;
  collectionId: string;
  issueId: string;
  createdAt: string;
  correction: StoryCorrection;
  beforeChapters: ChapterPackage[];
  beforePreparation: Collection["interviewPreparation"];
  afterChapterHash: string;
  sourceHash: string;
};
function auditId(input: StoryCorrection) {
  return `storycorrection_${hash(input)}`;
}

export async function storyCorrectionTemplate(
  collectionId: string,
  issueId: string,
) {
  const c = await getCollection(collectionId);
  if (!c) throw new SecurityError("Collection not found.", 404);
  requireDraft(c);
  const issue = c.storyIssues?.find(
    (item) => item.id === issueId && item.status === "open",
  );
  if (!issue) throw new SecurityError("Choose an open report.", 404);
  const chapter = chapterFor(c, issue.chapterId);
  return {
    collectionId,
    issueId,
    expectedChapterHash: storyChapterHash(c, chapter),
    expectedIssueHash: issue.chapterHash,
    expectedSourceHash: storySourceHash(c, chapter.id),
    content: chapter.content,
    sourceReviewed: false,
    // Private reference material to help the operator locate the original. The
    // apply path re-reads trusted sources and never trusts this copied reference.
    sourceReferences: selectedAnswers(c, chapter.id).map((answer) => ({
      takeId: answer.id,
      prompt: answer.prompt,
      transcript: answer.text,
      mediaIds: answer.liveSource
        ? [
            ...new Set(
              answer.liveSource.sourceRanges.map((range) => range.mediaId),
            ),
          ]
        : [answer.mediaId].filter(Boolean),
    })),
    evidence: [] as StoryCorrection["evidence"],
  };
}

/** Source-checked operator correction, append-only history and repeatable queue handoff. */
export async function resolveStoryIssue(
  input: StoryCorrection,
  options: { queueFilms?: (c: Collection) => Promise<void> } = {},
) {
  if (
    !input ||
    typeof input.collectionId !== "string" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(input.collectionId) ||
    typeof input.issueId !== "string" ||
    input.sourceReviewed !== true ||
    typeof input.content !== "string" ||
    !input.content.trim() ||
    input.content.length > 32000 ||
    ![
      input.expectedChapterHash,
      input.expectedIssueHash,
      input.expectedSourceHash,
    ].every(
      (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    ) ||
    !Array.isArray(input.evidence) ||
    input.evidence.length < 1 ||
    input.evidence.length > 20
  )
    throw new SecurityError(
      "Use a current correction file and confirm that the saved recording was reviewed.",
      400,
    );
  const id = auditId(input);
  let changed = false;
  const corrected = await mutateCollection(input.collectionId, async (c) => {
    requireDraft(c);
    const issue = c.storyIssues?.find((item) => item.id === input.issueId);
    if (!issue || issue.status === "withdrawn")
      throw new SecurityError("Choose an open report.", 404);
    const chapter = chapterFor(c, issue.chapterId);
    const previous = await readRecord<CorrectionAudit>(id);
    if (issue.status === "resolved") {
      if (
        !previous ||
        previous.afterChapterHash !== storyChapterHash(c, chapter) ||
        previous.sourceHash !== storySourceHash(c, chapter.id)
      )
        throw new SecurityError(
          "This report was already resolved against a different version.",
          409,
        );
      changed =
        previous.beforeChapters.find((item) => item.id === chapter.id)
          ?.content !== chapter.content;
      return c;
    }
    if (
      issue.chapterHash !== input.expectedIssueHash ||
      storyChapterHash(c, chapter) !== input.expectedChapterHash ||
      storySourceHash(c, chapter.id) !== input.expectedSourceHash
    )
      throw new SecurityError(
        "The story or its source changed. Inspect the current version before correcting it.",
        409,
      );
    const preparation =
      c.interviewPreparation &&
      (await getInterviewPreparationJob(c.interviewPreparation.id));
    const film = await latestFilmJob(c.id);
    if (
      (preparation && ["queued", "preparing"].includes(preparation.status)) ||
      (film && !["ready", "failed", "stale"].includes(film.status))
    )
      throw new SecurityError(
        "Wait for current preparation to stop before correcting a story.",
        409,
      );
    const answers = selectedAnswers(c, chapter.id);
    for (const evidence of input.evidence) {
      const answer =
        evidence && answers.find((item) => item.id === evidence.takeId);
      if (
        !answer ||
        typeof evidence.quote !== "string" ||
        evidence.quote.trim().length < 3 ||
        evidence.quote.length > 4000 ||
        !answer.text.includes(evidence.quote) ||
        !(await hasRecordedAnswerSource(answer, c, getMedia))
      )
        throw new SecurityError(
          "Every correction needs an exact supporting excerpt from a currently selected, saved original recording.",
          400,
        );
    }
    const next = structuredClone(c);
    const target = next.chapters.find((item) => item.id === chapter.id)!;
    changed = target.content !== input.content.trim();
    target.content = input.content.trim();
    const audit: CorrectionAudit = {
      recordType: "story-source-correction",
      id,
      collectionId: c.id,
      issueId: issue.id,
      createdAt: new Date().toISOString(),
      correction: input,
      beforeChapters: structuredClone(c.chapters),
      beforePreparation: structuredClone(c.interviewPreparation),
      afterChapterHash: storyChapterHash(next, target),
      sourceHash: input.expectedSourceHash,
    };
    await mutateRecord<CorrectionAudit>(id, (existing) => {
      if (
        existing &&
        (existing.afterChapterHash !== audit.afterChapterHash ||
          hash(existing.correction) !== hash(input))
      )
        throw new SecurityError(
          "A different correction already owns this audit record.",
          409,
        );
      return existing ?? audit;
    });
    const resolved = next.storyIssues!.find((item) => item.id === issue.id)!;
    resolved.status = "resolved";
    resolved.resolvedAt = audit.createdAt;
    resolved.resolution = changed
      ? "Checked against the saved recording. Review the corrected story and newly prepared films before sharing."
      : "Checked against the saved recording. The current wording was confirmed.";
    if (changed) {
      for (const item of next.chapters) {
        await preserveGeneratedFilmProvenance(c.id, item, getMedia, putMedia);
        item.editorialReviewed = false;
        item.reviewedFilmSha256 = undefined;
        item.videoStatus = "awaiting_edit";
        item.videoMediaId = undefined;
        item.film = undefined;
      }
      // Prevent an older preparation job from publishing its cached draft over
      // the correction. Its source data and old film artifacts remain intact.
      next.interviewPreparation = undefined;
      for (const notification of next.notifications) {
        if (
          ["review_ready", "preparation_attention"].includes(
            notification.kind,
          ) &&
          notification.status === "pending" &&
          !notification.dispatch?.firstAttemptAt &&
          !notification.dispatch?.leaseId
        ) {
          notification.status = "suppressed";
          notification.error = "Replaced by a source-checked story correction.";
        }
      }
    }
    return next;
  });
  if (changed) {
    const queue =
      options.queueFilms ??
      (async (c: Collection) => {
        const job = await enqueueAutomaticOriginalFilms(c, {
          processingApproved: true,
        });
        if (job.status === "ready") await attachReadyFilms(job);
      });
    await queue(corrected);
  }
  return { collection: corrected, auditId: id, filmsRequeued: changed };
}
