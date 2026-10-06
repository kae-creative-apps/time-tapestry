import { appOrigin, linksFor } from "./access";
import {
  normalizeRecipientEmail,
  recipientById,
  PRIMARY_RECIPIENT_ID,
} from "./recipients";
import type { Collection, Notification } from "./types";
import type { LivingStoryBatch, LivingStoryMoment } from "./living-story-types";

export const livingStoryOwnerUrl = (c: Collection) =>
  appOrigin() + linksFor(c).review + "#new-moments";
export const livingStoryRecipientUrl = (c: Collection) =>
  appOrigin() + linksFor(c).collection + "#new-moments";

function enqueue(c: Collection, notice: Notification) {
  if (!c.notifications.some((item) => item.id === notice.id))
    c.notifications.push(notice);
}

export function queueLivingStoryRequest(
  c: Collection,
  batch: LivingStoryBatch,
) {
  enqueue(c, {
    id: `${c.id}:moment-request:${batch.id}`,
    kind: "living_story_request",
    livingStoryBatchId: batch.id,
    to: c.storyteller.email,
    subject: "Your family has a question for you",
    text: `${batch.requestedByName || "Someone in your family"} would love to hear another story. Open your collection to see the questions. You can record whenever you are ready, or skip any question.`,
    url: livingStoryOwnerUrl(c),
    dueAt: batch.createdAt,
    status: "pending",
  });
}

export function queueLivingStoryPublished(
  c: Collection,
  moment: LivingStoryMoment,
) {
  const dueAt = moment.publishedAt!;
  enqueue(c, {
    id: `${c.id}:moment-published:${moment.id}:owner`,
    kind: "living_story_published",
    livingStoryMomentId: moment.id,
    to: c.storyteller.email,
    subject: "Your new Time Tapestry story is ready",
    text: `Your new film and written story, “${moment.title},” are ready in your private collection. The people you have invited can now enjoy them.`,
    url: livingStoryOwnerUrl(c),
    dueAt,
    status: "pending",
  });
  const ids = [
    PRIMARY_RECIPIENT_ID,
    ...(c.additionalRecipients ?? [])
      .filter((r) => !r.revokedAt)
      .map((r) => r.id),
  ];
  for (const id of ids) {
    const recipient = recipientById(c, id);
    if (!recipient) continue;
    enqueue(c, {
      id: `${c.id}:moment-published:${moment.id}:recipient:${id}`,
      kind: "living_story_published",
      livingStoryMomentId: moment.id,
      recipientId: id,
      to: recipient.email,
      subject: `${c.storyteller.name} has shared another story`,
      text: `A new film and written story, “${moment.title},” are ready in your private Time Tapestry collection. Sign in with your invited email address to watch and read.`,
      url: livingStoryRecipientUrl(c),
      dueAt,
      status: "pending",
    });
  }
}

/** Rechecked against current membership immediately before dispatch by the email worker. */
export function livingStoryNotificationSuppressionReason(
  c: Collection,
  n: Notification,
): string | null {
  if (!["living_story_request", "living_story_published"].includes(n.kind))
    return null;
  if (c.status !== "approved")
    return "This collection is not approved for sharing.";
  if (n.kind === "living_story_request") {
    const batch = c.livingStory?.batches.find(
      (item) => item.id === n.livingStoryBatchId,
    );
    if (
      !batch ||
      batch.source !== "family" ||
      batch.closedAt ||
      !recipientById(c, batch.requestedByRecipientId) ||
      n.id !== `${c.id}:moment-request:${batch.id}` ||
      normalizeRecipientEmail(n.to) !==
        normalizeRecipientEmail(c.storyteller.email) ||
      n.url !== livingStoryOwnerUrl(c)
    )
      return "This story request is no longer current.";
    return null;
  }
  const moment = c.livingStory?.moments.find(
    (item) => item.id === n.livingStoryMomentId,
  );
  if (
    !moment ||
    moment.status !== "published" ||
    !moment.videoMediaId ||
    !moment.content?.trim()
  )
    return "This new story is not published.";
  if (n.recipientId) {
    const recipient = recipientById(c, n.recipientId);
    if (
      !recipient ||
      normalizeRecipientEmail(n.to) !==
        normalizeRecipientEmail(recipient.email) ||
      n.id !==
        `${c.id}:moment-published:${moment.id}:recipient:${recipient.id}` ||
      n.url !== livingStoryRecipientUrl(c)
    )
      return "This story notification no longer belongs to an active recipient.";
  } else if (
    normalizeRecipientEmail(n.to) !==
      normalizeRecipientEmail(c.storyteller.email) ||
    n.id !== `${c.id}:moment-published:${moment.id}:owner` ||
    n.url !== livingStoryOwnerUrl(c)
  ) {
    return "This story confirmation belongs to the storyteller.";
  }
  return null;
}
