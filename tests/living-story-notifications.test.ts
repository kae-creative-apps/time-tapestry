import assert from "node:assert/strict";
import test from "node:test";
import { appOrigin } from "../src/lib/collection/access";
import { prepareCollection } from "../src/lib/collection/create";
import {
  livingStoryNotificationSuppressionReason,
  livingStoryOwnerUrl,
  livingStoryPublishedOwnerUrl,
  livingStoryRecipientUrl,
  queueLivingStoryPublished,
  queueLivingStoryRequest,
} from "../src/lib/collection/living-story-notifications";
import type {
  LivingStoryBatch,
  LivingStoryMoment,
} from "../src/lib/collection/living-story-types";

function collection() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Alex Example", email: "alex@example.test" },
    recipient: { name: "Sam Example", email: "sam@example.test" },
  });
  c.status = "approved";
  return c;
}

test("continued-story mail opens the story library instead of the original gift", () => {
  const c = collection();
  const batch: LivingStoryBatch = {
    id: "batch-continued",
    requestId: "request-continued",
    source: "family",
    requestedByName: "Sam Example",
    requestedByRecipientId: "primary",
    promptIds: ["character-listened"],
    createdAt: c.createdAt,
  };
  const moment: LivingStoryMoment = {
    id: "moment-continued",
    batchId: batch.id,
    promptId: "character-listened",
    category: "character",
    title: "Someone who listened",
    question: "Who taught you to listen?",
    status: "published",
    videoMediaId: "media-continued",
    content: "A short new chapter.",
    createdAt: c.createdAt,
    publishedAt: c.createdAt,
  };
  c.livingStory = { batches: [batch], moments: [moment] };
  queueLivingStoryRequest(c, batch);
  queueLivingStoryPublished(c, moment);

  const request = c.notifications.find(
    (notice) => notice.kind === "living_story_request",
  )!;
  const ownerReady = c.notifications.find(
    (notice) => notice.kind === "living_story_published" && !notice.recipientId,
  )!;
  const familyReady = c.notifications.find(
    (notice) => notice.kind === "living_story_published" && notice.recipientId,
  )!;
  const origin = appOrigin();
  assert.equal(
    request.url,
    `${origin}/collection/${c.id}/stories?key=${c.ownerKey}#new-moments`,
  );
  assert.equal(request.url, livingStoryOwnerUrl(c));
  assert.equal(request.url.includes("/review"), false);
  assert.equal(
    ownerReady.url,
    `${origin}/collection/${c.id}/stories?key=${c.ownerKey}#story-library`,
  );
  assert.equal(ownerReady.url, livingStoryPublishedOwnerUrl(c));
  assert.equal(
    familyReady.url,
    `${origin}/collection/${c.id}/stories#story-library`,
  );
  assert.equal(familyReady.url, livingStoryRecipientUrl(c));
  assert.equal(familyReady.url.includes("key="), false);
  assert.equal(familyReady.url.includes(c.ownerKey), false);
  assert.equal(familyReady.url.includes(c.recipientKey), false);
  assert.equal(livingStoryNotificationSuppressionReason(c, request), null);
  assert.equal(livingStoryNotificationSuppressionReason(c, ownerReady), null);
  assert.equal(livingStoryNotificationSuppressionReason(c, familyReady), null);
  assert.match(
    livingStoryNotificationSuppressionReason(c, {
      ...request,
      url: `${origin}/collection/${c.id}/review?key=${c.ownerKey}#new-moments`,
    }) || "",
    /no longer current/,
  );
  assert.match(
    livingStoryNotificationSuppressionReason(c, {
      ...familyReady,
      url: `${origin}/collection/${c.id}#new-moments`,
    }) || "",
    /no longer belongs/,
  );
});
