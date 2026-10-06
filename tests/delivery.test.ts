import { historicalApprovedCollection } from "./historical-delivery-fixture";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { CHAPTERS } from "../src/lib/interview-state";
import { approveCollection } from "../src/lib/collection/content";
import {
  applyLobEvent,
  nextDuePostcard,
  notificationSuppressionReason,
  parseLobEvent,
  postcardArtwork,
  postcardFollowup,
  recipientChapterUrl,
  verifyLobSignature,
} from "../src/lib/collection/delivery";
import type { LobEvent } from "../src/lib/collection/delivery";
import type { Collection } from "../src/lib/collection/types";

const origin = "https://example.test";
const start = "2026-01-31T12:00:00.000Z";
function collection(): Collection {
  const draft: Collection = {
    schemaVersion: 2,
    id: "collection-test-123",
    createdAt: start,
    updatedAt: start,
    status: "draft",
    initiationPath: "share",
    ownerKey: "owner-test-key",
    recipientKey: "recipient-test-key",
    requesterKey: "requester-test-key",
    storyteller: { name: "Storyteller", email: "storyteller@example.test" },
    recipient: { name: "Recipient", email: "recipient@example.test" },
    requester: { name: "Storyteller", email: "storyteller@example.test" },
    address: {
      name: "Recipient",
      line1: "1 Test Way",
      city: "Test City",
      region: "CA",
      postalCode: "90001",
      country: "US",
    },
    addressConfirmed: true,
    invitationNote: "",
    faithFraming: "faith",
    chapterBlessings: {},
    currentQuestion: 3,
    takes: [],
    selectedTakeIds: {},
    followUps: {},
    chapters: CHAPTERS.map((ch) => ({
      id: ch.id,
      title: ch.title,
      content: "A source-backed story.",
      postcardNote: "An approved note.",
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    })),
    deliveries: [],
    replies: [],
    notifications: [],
    recipientViewedChapters: {},
    replyRemindersEnabled: true,
  };
  return historicalApprovedCollection(draft, start);
}
function mailingEvent(
  name = "postcard.mailed",
  eventId = "evt_test001",
  at = "2026-02-03T12:00:00.000Z",
): LobEvent {
  return {
    id: eventId,
    reference_id: "psc_test001",
    event_type: { id: name },
    body: {
      id: "psc_test001",
      tracking_events: [
        {
          name: name === "postcard.in_transit" ? "In Transit" : "Mailed",
          time: at,
        },
      ],
    },
  };
}
function submitted() {
  const c = collection();
  c.deliveries[0] = {
    ...c.deliveries[0],
    providerId: "psc_test001",
    status: "submitted",
  };
  return c;
}
const eventNow = new Date("2026-02-04T12:00:00.000Z").getTime();

test("four mailings use calendar months, including month-end clamping", () => {
  const c = collection();
  assert.deepEqual(
    c.deliveries.map((d) => d.scheduledFor),
    [
      "2026-01-31T12:00:00.000Z",
      "2026-04-30T12:00:00.000Z",
      "2026-07-31T12:00:00.000Z",
      "2026-10-31T12:00:00.000Z",
    ],
  );
  assert.equal(nextDuePostcard(c, new Date(start).getTime() - 1), null);
  assert.equal(nextDuePostcard(c, new Date(start).getTime())?.chapterId, "q1");
});

test("overdue cards cannot batch together or bypass unconfirmed mailing", () => {
  const c = submitted();
  const late = new Date("2027-01-01T00:00:00.000Z").getTime();
  assert.equal(nextDuePostcard(c, late), null);
  c.deliveries[0].status = "mailed";
  c.deliveries[0].mailedAt = "2026-12-15T00:00:00.000Z";
  assert.equal(nextDuePostcard(c, late), null);
  assert.equal(
    nextDuePostcard(c, new Date("2027-03-15T00:00:00.000Z").getTime())
      ?.chapterId,
    "q2",
  );
});

test("created does not mean mailed and does not queue recipient or storyteller emails", () => {
  const c = submitted();
  const event = mailingEvent("postcard.created");
  event.body.tracking_events = [];
  const result = applyLobEvent(c, event, origin, eventNow).collection;
  assert.equal(result.deliveries[0].status, "submitted");
  assert.equal(result.deliveries[0].mailedAt, undefined);
  assert.equal(result.notifications.length, 0);
});

test("confirmed mailing shifts later cards and queues one owner update plus a 14-day fallback", () => {
  const result = applyLobEvent(
    submitted(),
    mailingEvent(),
    origin,
    eventNow,
  ).collection;
  assert.equal(result.deliveries[0].mailedAt, "2026-02-03T12:00:00.000Z");
  assert.equal(result.deliveries[1].scheduledFor, "2026-05-03T12:00:00.000Z");
  assert.equal(result.deliveries[2].scheduledFor, "2026-08-03T12:00:00.000Z");
  assert.equal(result.deliveries[3].scheduledFor, "2026-11-03T12:00:00.000Z");
  assert.equal(result.notifications.length, 2);
  const status = result.notifications.find(
    (n) => n.kind === "postcard_mailed",
  )!;
  const fallback = result.notifications.find(
    (n) => n.kind === "postcard_followup",
  )!;
  assert.equal(status.to, result.storyteller.email);
  assert.equal(fallback.to, result.recipient.email);
  assert.equal(fallback.dueAt, "2026-02-17T12:00:00.000Z");
  assert.match(fallback.text, /If it has not reached you/);
  assert.equal(fallback.url, `${origin}/collection/${result.id}/chapter/q1`);
});

test("duplicate webhooks and distinct tracking events cannot duplicate notifications", () => {
  const first = applyLobEvent(submitted(), mailingEvent(), origin, eventNow);
  const duplicate = applyLobEvent(
    first.collection,
    mailingEvent(),
    origin,
    eventNow,
  );
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.collection.notifications.length, 2);
  const transit = applyLobEvent(
    duplicate.collection,
    mailingEvent("postcard.in_transit", "evt_test002"),
    origin,
    eventNow,
  );
  assert.equal(transit.collection.notifications.length, 2);
  assert.equal(transit.collection.processedMailEventIds?.length, 2);
});

test("in-transit confirmation uses carrier time, not webhook arrival time", () => {
  const event = mailingEvent(
    "postcard.in_transit",
    "evt_transit",
    "2026-02-01T08:30:00.000Z",
  );
  const c = applyLobEvent(submitted(), event, origin, eventNow).collection;
  assert.equal(c.deliveries[0].mailedAt, "2026-02-01T08:30:00.000Z");
  assert.equal(
    c.notifications.find((n) => n.kind === "postcard_followup")?.dueAt,
    "2026-02-15T08:30:00.000Z",
  );
  assert.equal(c.deliveries[0].mailEvent, "postcard.in_transit");
});

test("a delayed return stops follow-ups and cannot be reversed by an older scan", () => {
  const sent = applyLobEvent(
    submitted(),
    mailingEvent(),
    origin,
    eventNow,
  ).collection;
  const returned = applyLobEvent(
    sent,
    mailingEvent("postcard.returned_to_sender", "evt_return"),
    origin,
    eventNow,
  ).collection;
  assert.equal(returned.addressConfirmed, false);
  assert.equal(
    returned.notifications.find((n) => n.kind === "postcard_followup")?.status,
    "suppressed",
  );
  const stale = applyLobEvent(
    returned,
    mailingEvent("postcard.in_transit", "evt_late"),
    origin,
    eventNow,
  ).collection;
  assert.equal(stale.deliveries[0].status, "returned");
  assert.equal(nextDuePostcard(stale, new Date("2027-01-01").getTime()), null);
});

test("recipient preference and existing reply suppress the reminder; viewed copy invites a reply", () => {
  const c = applyLobEvent(
    submitted(),
    mailingEvent(),
    origin,
    eventNow,
  ).collection;
  c.recipientViewedChapters.q1 = "2026-02-04T10:00:00.000Z";
  const notification = postcardFollowup(c, c.deliveries[0], origin);
  assert.match(notification.text, /Thank you for spending time/);
  assert.equal(notificationSuppressionReason(c, notification), null);
  c.replyRemindersEnabled = false;
  assert.match(notificationSuppressionReason(c, notification)!, /turned off/);
  c.replyRemindersEnabled = true;
  c.replies.push({
    id: "reply-1",
    chapterId: "q1",
    text: "Thank you.",
    createdAt: "2026-02-04T11:00:00.000Z",
  });
  assert.match(
    notificationSuppressionReason(c, notification)!,
    /already replied/,
  );
});

test("immediate collection emails and recipient postcard status spoilers are suppressed", () => {
  const c = applyLobEvent(
    submitted(),
    mailingEvent(),
    origin,
    eventNow,
  ).collection;
  const base = c.notifications[0];
  assert.match(
    notificationSuppressionReason(c, {
      ...base,
      kind: "collection_ready",
      to: c.recipient.email,
    })!,
    /first postcard/,
  );
  assert.match(
    notificationSuppressionReason(c, {
      ...base,
      kind: "postcard_mailed",
      to: c.recipient.email,
    })!,
    /only to the storyteller/,
  );
});

test("HMAC verification rejects stale, future, tampered and malformed requests", () => {
  const body = JSON.stringify(mailingEvent());
  const secret = "unit-test-private-webhook-secret";
  const timestamp = String(Math.floor(eventNow / 1000));
  const signature = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");
  assert.equal(
    verifyLobSignature(body, signature, timestamp, secret, eventNow),
    true,
  );
  assert.equal(
    verifyLobSignature(body + " ", signature, timestamp, secret, eventNow),
    false,
  );
  assert.equal(
    verifyLobSignature(body, signature, timestamp, secret, eventNow + 301000),
    false,
  );
  assert.equal(
    verifyLobSignature(body, signature, timestamp, secret, eventNow - 301000),
    false,
  );
  assert.equal(
    verifyLobSignature(body, "invalid", timestamp, secret, eventNow),
    false,
  );
  assert.equal(
    verifyLobSignature(body, signature, "not-a-time", secret, eventNow),
    false,
  );
});

test("invalid or timestamp-free mail events are rejected without changing the collection", () => {
  assert.throws(() => parseLobEvent({}));
  assert.throws(() =>
    parseLobEvent({ ...mailingEvent(), reference_id: "psc_wrong" }),
  );
  assert.throws(() =>
    parseLobEvent({
      ...mailingEvent(),
      body: { id: "psc_test001", tracking_events: [null] },
    }),
  );
  const event = mailingEvent();
  event.body.tracking_events = [];
  const c = submitted();
  assert.throws(
    () => applyLobEvent(c, event, origin, eventNow),
    /tracking timestamp/,
  );
  assert.equal(c.processedMailEventIds, undefined);
  assert.equal(c.notifications.length, 0);
});

test("print artwork uses only escaped public copy and a keyless QR, never private blessings", async () => {
  const c = collection();
  c.postcardPublicMessages = { q1: '<script>alert("test")</script>' };
  c.chapterBlessings.q1 = {
    encouragement: "Private encouragement",
    scriptureReference: "Private reference",
    scriptureText: "Private words.",
    scriptureTranslation: "Private translation",
  };
  const artwork = await postcardArtwork(c, "q1", origin);
  assert.match(artwork.back, /data:image\/png;base64,/);
  assert.match(artwork.back, /&lt;script&gt;/);
  assert.doesNotMatch(
    artwork.front + artwork.back,
    /<script>|Private encouragement|Private words/,
  );
  assert.doesNotMatch(artwork.front + artwork.back, /An approved note/);
  assert.equal(
    recipientChapterUrl(c, "q1", origin),
    `${origin}/collection/${c.id}/chapter/q1`,
  );
  c.postcardPublicMessages.q1 = "x".repeat(241);
  await assert.rejects(postcardArtwork(c, "q1", origin), /exceeds 240/);
  assert.throws(
    () => recipientChapterUrl(c, "q1", "http://localhost:3000"),
    /HTTPS/,
  );
});

test("new biweekly journeys retain two-week gaps after delayed mailing", () => {
  const legacy = collection();
  const draft = {
    ...legacy,
    status: "draft" as const,
    postcardCadence: "biweekly" as const,
    deliveries: [],
  };
  const c = historicalApprovedCollection(draft, start);
  assert.deepEqual(
    c.deliveries.map((d) => d.scheduledFor),
    [
      start,
      "2026-02-14T12:00:00.000Z",
      "2026-02-28T12:00:00.000Z",
      "2026-03-14T12:00:00.000Z",
    ],
  );
  c.deliveries[0].providerId = "psc_test001";
  c.deliveries[0].status = "submitted";
  const shifted = applyLobEvent(c, mailingEvent(), origin, eventNow).collection;
  assert.deepEqual(
    shifted.deliveries.slice(1).map((d) => d.scheduledFor),
    [
      "2026-02-17T12:00:00.000Z",
      "2026-03-03T12:00:00.000Z",
      "2026-03-17T12:00:00.000Z",
    ],
  );
  assert.equal(
    nextDuePostcard(shifted, Date.parse("2026-02-17T11:59:59.999Z")),
    null,
  );
  assert.equal(
    nextDuePostcard(shifted, Date.parse("2026-02-17T12:00:00.000Z"))?.chapterId,
    "q2",
  );
  const savedSchedule = structuredClone(legacy.deliveries);
  assert.equal(approveCollection(legacy, "2027-01-01T12:00:00.000Z"), legacy);
  assert.deepEqual(legacy.deliveries, savedSchedule);
  assert.equal(legacy.postcardCadence, undefined);
});
