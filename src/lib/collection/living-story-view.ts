import type { Collection } from "./types";
import type { LivingStory } from "./living-story-types";

/** Family may see pending questions, never a storyteller's unpublished media. */
export function livingStoryView(c: Collection, role: string): LivingStory {
  if (c.status !== "approved" || !["owner", "recipient"].includes(role))
    return { batches: [], moments: [] };
  const story = structuredClone(c.livingStory ?? { batches: [], moments: [] });
  if (role === "owner") return story;
  story.moments = story.moments
    .filter(
      (moment) =>
        moment.status === "published" ||
        (["draft", "processing", "needs_attention"].includes(moment.status) &&
          story.batches.some(
            (batch) =>
              batch.id === moment.batchId &&
              batch.source === "family" &&
              !batch.closedAt,
          )),
    )
    .map((moment) => {
      const {
        sourceMediaId,
        sourceSha256,
        processing,
        processingError,
        processingApprovedAt,
        ...question
      } = moment;
      void sourceMediaId;
      void sourceSha256;
      void processing;
      void processingError;
      void processingApprovedAt;
      if (moment.status === "published") return question;
      const { videoMediaId, content, kind, ...pending } = question;
      void videoMediaId;
      void content;
      void kind;
      return pending;
    });
  const visible = new Set(story.moments.map((moment) => moment.batchId));
  story.batches = story.batches
    .filter((batch) => visible.has(batch.id))
    .map((batch) => {
      const { requestedByRecipientId, ...display } = batch;
      void requestedByRecipientId;
      // Request IDs are caller-provided idempotency values, not public metadata.
      return { ...display, requestId: "" };
    });
  return story;
}
