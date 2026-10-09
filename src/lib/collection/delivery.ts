import {
  pipelineContext,
  withPipelineStage,
} from "../observability/pipeline-logger";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { livingStoryNotificationSuppressionReason } from "./living-story-notifications";
import { BRAND_COLORS } from "../brand-art";
import { CHAPTERS } from "../interview-state";
import {
  assertReleasedPostcardProof,
  prepareAutomaticPostcards,
  postcardDeliveryMode,
  postcardNoticeRevision,
  holdPostcardsForAttention,
} from "./postcard-proofs";
import { postcardScheduledDate } from "./postcard-cadence";
import { appOrigin, linksFor } from "./access";
import { INTERVIEW_PACING_COPY } from "./interview-progress";
import {
  PRIMARY_RECIPIENT_ID,
  normalizeRecipientEmail,
  recipientById,
  storedRecipientId,
} from "./recipients";
import {
  getCollection,
  getMedia,
  listCollections,
  mutateCollection,
  mutateRecord,
  readRecord,
} from "./store";
import {
  lobPostcardTransport,
  serializeLobPostcardRequest,
} from "./lob-transport";
import { postcardArtworkFormat } from "./postcard-format";
import type {
  Collection,
  Delivery,
  DispatchState,
  Notification,
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
import {
  originUrl,
  recipientChapterUrl,
  postcardArtwork,
} from "./postcard-artwork";
export {
  recipientChapterUrl,
  postcardArtwork,
  POSTCARD_COPY_LIMIT,
} from "./postcard-artwork";

function time(iso: string) {
  return new Date(iso).getTime();
}
function iso(ms: number) {
  return new Date(ms).toISOString();
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"'{}]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "{": "&#123;",
        "}": "&#125;",
      })[c]!,
  );
}
function ownerUrl(c: Collection, origin: string) {
  return (
    originUrl(origin) +
    "/collection/" +
    encodeURIComponent(c.id) +
    "?key=" +
    encodeURIComponent(c.ownerKey)
  );
}
export function postcardIdempotencyKey(c: Collection, chapterId: string) {
  return (
    "time-tapestry/" +
    c.id +
    "/v" +
    (c.approvedVersion || 1) +
    "/postcard/" +
    chapterId
  );
}
function canRetry(dispatch: DispatchState | undefined, now: number) {
  return (
    !dispatch?.reconciliationRequired &&
    (dispatch?.attempts || 0) < MAX_ATTEMPTS &&
    (!dispatch?.leaseExpiresAt || time(dispatch.leaseExpiresAt) <= now) &&
    (!dispatch?.nextAttemptAt || time(dispatch.nextAttemptAt) <= now)
  );
}
function notificationNeedsAttempt(
  notification: Notification | undefined,
  now: number,
): notification is Notification {
  return Boolean(
    notification &&
    ["pending", "failed"].includes(notification.status) &&
    time(notification.dueAt) <= now &&
    canRetry(notification.dispatch, now),
  );
}

/** Recipient-facing mail goes first so a stale storyteller notice cannot take the one daily slot. */
export function notificationDeliveryRank(n: Notification): number {
  switch (n.kind) {
    case "collection_ready":
    case "recipient_invitation":
      return 0;
    case "address_request":
      return 1;
    case "invitation":
      return 2;
    case "living_story_request":
    case "living_story_published":
      return 3;
    case "review_ready":
      return n.id.endsWith(":owner-approved") ? 4 : 5;
    case "postcard_ready":
    case "postcard_attention":
    case "postcard_mailed":
    case "postcard_followup":
      return 6;
    case "reply_invitation":
    case "reply_received":
      return 7;
    case "preparation_attention":
      return 8;
    default:
      return 9;
  }
}

export function notificationsInDeliveryOrder(notifications: Notification[]) {
  return notifications
    .map((notification, index) => ({ notification, index }))
    .sort((a, b) => {
      const rank =
        notificationDeliveryRank(a.notification) -
        notificationDeliveryRank(b.notification);
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map(({ notification }) => notification);
}
function expiredRetryWindow(dispatch: DispatchState | undefined, now: number) {
  return Boolean(
    dispatch?.firstAttemptAt &&
    now - time(dispatch.firstAttemptAt) >= IDEMPOTENCY_WINDOW_MS,
  );
}

/** At most the first unresolved postcard can advance. Submission is not mailing. */
export function nextDuePostcard(
  c: Collection,
  now = Date.now(),
): Delivery | null {
  if (c.status !== "approved" || !c.addressConfirmed || !c.address) return null;
  for (let index = 0; index < c.deliveries.length; index += 1) {
    const delivery = c.deliveries[index];
    if (delivery.status === "mailed" && delivery.mailedAt) continue;
    if (
      !["scheduled", "failed"].includes(delivery.status) ||
      delivery.providerId
    )
      return null;
    const previous = c.deliveries[index - 1];
    if (previous && (previous.status !== "mailed" || !previous.mailedAt))
      return null;
    const earliest = previous?.mailedAt
      ? Math.max(
          time(delivery.scheduledFor),
          time(postcardScheduledDate(c, previous.mailedAt, 1)),
        )
      : time(delivery.scheduledFor);
    return Number.isFinite(earliest) &&
      earliest <= now &&
      canRetry(delivery.dispatch, now)
      ? delivery
      : null;
  }
  return null;
}

/** Delays push later unsent cards out; they never bunch into an overdue batch. */
export function shiftFuturePostcards(
  c: Collection,
  chapterId: string,
  mailedAt: string,
) {
  const index = c.deliveries.findIndex((d) => d.chapterId === chapterId);
  if (index < 0) return;
  c.deliveries.forEach((delivery, nextIndex) => {
    if (
      nextIndex <= index ||
      delivery.providerId ||
      delivery.status === "mailed"
    )
      return;
    const minimum = postcardScheduledDate(c, mailedAt, nextIndex - index);
    if (time(delivery.scheduledFor) < time(minimum))
      delivery.scheduledFor = minimum;
  });
}

export function notificationSuppressionReason(
  c: Collection,
  n: Notification,
): string | null {
  const livingStoryReason = livingStoryNotificationSuppressionReason(c, n);
  if (livingStoryReason) return livingStoryReason;
  if (
    ["preparation_attention", "postcard_ready", "postcard_attention"].includes(
      n.kind,
    ) &&
    normalizeRecipientEmail(n.to) !==
      normalizeRecipientEmail(c.storyteller.email)
  )
    return "This preparation notice belongs to the storyteller.";
  if (n.kind === "preparation_attention" && c.status === "approved")
    return "This collection has already been approved.";
  if (
    n.kind === "postcard_ready" &&
    (c.status !== "approved" ||
      !c.addressConfirmed ||
      !c.address ||
      c.postcardPreparation?.status === "ready" ||
      !n.id.endsWith(postcardNoticeRevision(c)))
  )
    return "This postcard review request is no longer current.";
  if (
    n.kind === "postcard_attention" &&
    (c.postcardPreparation?.status !== "needs_attention" ||
      !n.id.endsWith(postcardNoticeRevision(c)))
  )
    return "This postcard hold no longer needs attention.";
  if (
    [
      "collection_ready",
      "address_request",
      "postcard_followup",
      "reply_invitation",
    ].includes(n.kind) &&
    (storedRecipientId(n) !== PRIMARY_RECIPIENT_ID ||
      normalizeRecipientEmail(n.to) !==
        normalizeRecipientEmail(c.recipient.email))
  )
    return "This postcard-related email does not match the primary recipient.";
  if (n.kind === "recipient_invitation") {
    const recipient = n.recipientId && recipientById(c, n.recipientId);
    const member = c.additionalRecipients?.find(
      (item) => item.id === n.recipientId,
    );
    if (
      c.status !== "approved" ||
      !recipient ||
      recipient.primary ||
      !member ||
      normalizeRecipientEmail(n.to) !== recipient.email ||
      n.url !== appOrigin() + linksFor(c).collection ||
      n.id !==
        `${c.id}:recipient:${recipient.id}:invitation:${member.invitationVersion || 1}`
    )
      return "This digital invitation no longer matches an active recipient of the approved collection.";
  }
  if (n.kind === "collection_ready") {
    if (n.id !== `${c.id}:digital-ready`)
      return "The first postcard introduces the gift, so this email is not sent.";
    if (c.status !== "approved")
      return "The stories have not been approved for sharing.";
    if (
      n.to !== c.recipient.email ||
      ![
        appOrigin() + linksFor(c).collection,
        // Already queued mail may retain its old locator. The recipient key no
        // longer grants access; verified-account authorization is still required.
        appOrigin() + linksFor(c).collection + `?key=${c.recipientKey}`,
      ].includes(n.url)
    )
      return "The approved recipient and private story link need to be checked.";
  }
  if (n.kind === "invitation" && c.status !== "invited")
    return "The storyteller has already started or completed the interview.";
  if (n.kind === "review_ready") {
    if (n.id === `${c.id}:owner-approved`) {
      if (c.status !== "approved")
        return "This collection has not been approved.";
      if (
        n.to !== c.storyteller.email ||
        n.url !== appOrigin() + linksFor(c).review
      )
        return "The storyteller confirmation address and link need to be checked.";
    } else if (
      n.id.startsWith(`${c.id}:playback-ready:`) ||
      n.id.startsWith(`${c.id}:export-ready:`)
    ) {
      const exporting = n.id.startsWith(`${c.id}:export-ready:`);
      const prefix = `${c.id}:${exporting ? "export" : "playback"}-ready:`;
      const jobId = n.id.slice(prefix.length);
      if (
        n.to !== c.storyteller.email ||
        n.url !== appOrigin() + linksFor(c).review ||
        (exporting
          ? !["draft", "approved"].includes(c.status)
          : c.status !== "draft") ||
        c.draftOutdated ||
        c.chapters.length !== 4 ||
        !/^film_[a-f0-9]{64}$/.test(jobId) ||
        !CHAPTERS.every(({ id }) => {
          const chapter = c.chapters.find((item) => item.id === id);
          return (
            chapter?.content.trim() &&
            chapter.playback &&
            (exporting
              ? Boolean(
                  chapter.playback.exportMediaId &&
                  chapter.playback.exportSha256,
                )
              : chapter.playback.jobId === jobId)
          );
        })
      )
        return "This notice does not match the four current prepared chapters.";
    } else if (c.status !== "draft") {
      return "This draft is no longer awaiting review.";
    } else if (n.id.startsWith(`${c.id}:films-ready:`)) {
      const jobId = n.id.slice(`${c.id}:films-ready:`.length);
      if (
        n.to !== c.storyteller.email ||
        n.url !== appOrigin() + linksFor(c).review ||
        c.draftOutdated ||
        c.chapters.length !== 4 ||
        !CHAPTERS.every(({ id }) => {
          const chapter = c.chapters.find((item) => item.id === id);
          return (
            chapter?.content.trim() &&
            chapter.videoStatus === "ready" &&
            chapter.film?.narrationKind === "original_recording" &&
            chapter.film.jobId === jobId &&
            chapter.film.chapterId === id &&
            chapter.videoMediaId === chapter.film.mediaId &&
            chapter.film.outputSha256
          );
        })
      )
        return "The four current written stories and recorded films are not all ready to review.";
    }
  }
  if (n.kind === "address_request" && c.addressConfirmed)
    return "The mailing address has already been confirmed.";
  if (n.kind === "postcard_mailed" && n.to !== c.storyteller.email)
    return "Postcard status emails go only to the storyteller.";
  if (["postcard_followup", "reply_invitation"].includes(n.kind)) {
    if (c.status !== "approved")
      return "The stories have not been approved for sharing.";
    if (!c.replyRemindersEnabled)
      return "The recipient turned off follow-up emails.";
    if (
      c.replies.some(
        (r) =>
          r.chapterId === n.chapterId &&
          storedRecipientId(r) === PRIMARY_RECIPIENT_ID,
      )
    )
      return "The recipient has already replied to this story.";
    const delivery = c.deliveries.find((d) => d.chapterId === n.chapterId);
    if (!delivery?.mailedAt || delivery.status !== "mailed")
      return "Mailing has not been confirmed or the postcard was returned.";
  }
  return null;
}

export function postcardFollowup(
  c: Collection,
  delivery: Delivery,
  origin = appOrigin(),
): Notification {
  if (!delivery.mailedAt)
    throw new Error("A confirmed mailing timestamp is required.");
  const chapter = c.chapters.find((ch) => ch.id === delivery.chapterId);
  if (!chapter) throw new Error("Postcard chapter not found.");
  const viewed = Boolean(c.recipientViewedChapters[chapter.id]);
  return {
    id: postcardIdempotencyKey(c, chapter.id) + "/followup",
    kind: "postcard_followup",
    recipientId: PRIMARY_RECIPIENT_ID,
    chapterId: chapter.id,
    to: c.recipient.email,
    subject: viewed
      ? "Would you like to reply to " + c.storyteller.name + "?"
      : "Did your Time Tapestry postcard reach you?",
    text: viewed
      ? "Thank you for spending time with " +
        c.storyteller.name +
        "'s story. If you would like, you can send a video or written message from the story page. A memory, a question or a thank-you is enough. You can skip this, too."
      : "We sent you a postcard from " +
        c.storyteller.name +
        ". If it has not reached you, here is your story. All four approved stories and any included videos are available on your private page. If you would like, you can send a video or written message back after you watch or read.",
    url: recipientChapterUrl(c, chapter.id, origin),
    dueAt: iso(time(delivery.mailedAt) + 14 * DAY),
    status: "pending",
  };
}

type LobTracking = { name?: unknown; time?: unknown };
export type LobEvent = {
  id: string;
  reference_id: string;
  event_type: { id: string };
  body: { id?: string; tracking_events?: LobTracking[] | null };
};
export function parseLobEvent(value: unknown): LobEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid event.");
  const v = value as Record<string, unknown>;
  const eventType = v.event_type as Record<string, unknown> | undefined;
  const body = v.body as Record<string, unknown> | undefined;
  if (
    typeof v.id !== "string" ||
    !/^evt_[a-zA-Z0-9_-]{1,120}$/.test(v.id) ||
    typeof v.reference_id !== "string" ||
    !/^psc_[a-zA-Z0-9_-]{1,120}$/.test(v.reference_id) ||
    !eventType ||
    typeof eventType.id !== "string" ||
    !eventType.id.startsWith("postcard.") ||
    !body ||
    (body.id !== undefined && body.id !== v.reference_id) ||
    (body.tracking_events !== undefined &&
      body.tracking_events !== null &&
      (!Array.isArray(body.tracking_events) ||
        body.tracking_events.some(
          (t) =>
            !t ||
            typeof t !== "object" ||
            (t.name !== undefined && typeof t.name !== "string") ||
            (t.time !== undefined && typeof t.time !== "string"),
        )))
  ) {
    throw new Error("Invalid postcard event.");
  }
  return v as unknown as LobEvent;
}
export function verifyLobSignature(
  rawBody: string | Buffer,
  signature: string,
  timestamp: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !secret ||
    !/^[a-fA-F0-9]{64}$/.test(signature) ||
    !/^\d{10}(?:\d{3})?$/.test(timestamp)
  )
    return false;
  const milliseconds = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (
    !Number.isFinite(milliseconds) ||
    Math.abs(now - milliseconds) > 5 * 60 * 1000
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(rawBody)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
function mailingEvidence(event: LobEvent, now: number) {
  const points = (event.body.tracking_events || []).filter(
    (t) =>
      (t.name === "Mailed" || t.name === "In Transit") &&
      typeof t.time === "string" &&
      Number.isFinite(time(t.time)) &&
      time(t.time) <= now + 5 * 60 * 1000,
  );
  const mailed = points.filter((t) => t.name === "Mailed");
  const evidence = (mailed.length ? mailed : points).sort(
    (a, b) => time(a.time as string) - time(b.time as string),
  )[0];
  return evidence
    ? {
        at: iso(time(evidence.time as string)),
        event:
          evidence.name === "Mailed"
            ? "postcard.mailed"
            : "postcard.in_transit",
      }
    : null;
}

/** Pure reducer used under the store lock. It queues work and makes no API calls. */
export function applyLobEvent(
  current: Collection,
  event: LobEvent,
  origin = appOrigin(),
  now = Date.now(),
) {
  const c = structuredClone(current);
  const delivery = c.deliveries.find(
    (d) => d.providerId === event.reference_id,
  );
  if (!delivery) throw new Error("Postcard is not recorded yet.");
  if (c.processedMailEventIds?.includes(event.id))
    return { collection: c, duplicate: true };
  const type = event.event_type.id;
  if (type === "postcard.returned_to_sender" || type === "postcard.re-routed") {
    delivery.status = "returned";
    delivery.error =
      type === "postcard.returned_to_sender"
        ? "The postcard was returned. Confirm the address before further mailing."
        : "The postcard was rerouted. Confirm the address before further mailing.";
    delivery.mailEvent = type;
    c.addressConfirmed = false;
    holdPostcardsForAttention(c, delivery.error, iso(now), origin);
  } else if (
    ["postcard.failed", "postcard.rejected", "postcard.deleted"].includes(type)
  ) {
    delivery.status = "failed";
    delivery.error =
      "The printing service reported that this postcard failed or was canceled. The Time Tapestry team needs to check before another attempt.";
    delivery.dispatch = { ...delivery.dispatch, reconciliationRequired: true };
    delivery.mailEvent = type;
    holdPostcardsForAttention(c, delivery.error, iso(now), origin);
  } else if (
    type !== "postcard.created" &&
    !type.startsWith("postcard.rendered_")
  ) {
    const evidence = mailingEvidence(event, now);
    if (
      (type === "postcard.mailed" || type === "postcard.in_transit") &&
      !evidence
    ) {
      throw new Error(
        "Mail confirmation is missing a valid tracking timestamp.",
      );
    }
    if (
      evidence &&
      delivery.status !== "returned" &&
      delivery.status !== "failed"
    ) {
      if (!delivery.mailedAt || time(evidence.at) < time(delivery.mailedAt)) {
        delivery.mailedAt = evidence.at;
        delivery.mailEvent = evidence.event;
      }
      delivery.status = "mailed";
      delivery.error = undefined;
      shiftFuturePostcards(c, delivery.chapterId, delivery.mailedAt!);
      const statusId =
        postcardIdempotencyKey(c, delivery.chapterId) + "/mailed";
      if (!c.notifications.some((n) => n.id === statusId)) {
        const chapter = c.chapters.find((ch) => ch.id === delivery.chapterId);
        c.notifications.push({
          id: statusId,
          kind: "postcard_mailed",
          chapterId: delivery.chapterId,
          to: c.storyteller.email,
          subject: "Your Time Tapestry postcard is on its way",
          text:
            'Mailing has been confirmed for "' +
            (chapter?.title || "your story") +
            '". ' +
            (c.deliveries[0].chapterId === delivery.chapterId
              ? "This first postcard introduces the gift. "
              : "This postcard returns to your approved stories. ") +
            "Its QR code opens the approved stories. You can check the remaining postcard schedule on your page.",
          url: ownerUrl(c, origin),
          dueAt: iso(now),
          status: "pending",
        });
      }
      const followup = postcardFollowup(c, delivery, origin);
      const existing = c.notifications.find((n) => n.id === followup.id);
      if (!existing) c.notifications.push(followup);
      else if (
        existing.status === "pending" &&
        !existing.dispatch?.firstAttemptAt
      )
        existing.dueAt = followup.dueAt;
    }
  }
  c.processedMailEventIds = [...(c.processedMailEventIds || []), event.id];
  for (const n of c.notifications) {
    if (n.status !== "pending" && n.status !== "failed") continue;
    const reason = notificationSuppressionReason(c, n);
    if (reason) {
      n.status = "suppressed";
      n.error = reason;
    }
  }
  return { collection: c, duplicate: false };
}

export async function receiveLobEvent(event: LobEvent, origin = appOrigin()) {
  const all = await listCollections();
  const match = all.find((c) =>
    c.deliveries.some((d) => d.providerId === event.reference_id),
  );
  if (!match) throw new Error("Postcard is not recorded yet.");
  let duplicate = false;
  await mutateCollection(match.id, (c) => {
    const result = applyLobEvent(c, event, origin);
    duplicate = result.duplicate;
    return result.collection;
  });
  return { duplicate };
}

async function postcardRequest(
  c: Collection,
  chapterId: string,
  origin: string,
) {
  const proof = assertReleasedPostcardProof(c, origin);
  const a = proof.address;
  const artwork = proof.cards.find((card) => card.chapterId === chapterId);
  if (!artwork)
    throw new Error(
      "This postcard is missing from the approved print snapshot.",
    );
  const format = postcardArtworkFormat(artwork);
  return serializeLobPostcardRequest({
    description:
      "Time Tapestry " +
      c.id +
      " v" +
      (c.approvedVersion || 1) +
      " " +
      chapterId,
    to: {
      name: a.name,
      address_line1: a.line1,
      address_line2: a.line2 || "",
      address_city: a.city,
      address_state: a.region,
      address_zip: a.postalCode,
      address_country: a.country,
    },
    from: process.env.LOB_FROM_ADDRESS_ID || "",
    size: format.size,
    mail_type: "usps_first_class",
    use_type: "operational",
    front: artwork.front,
    back: artwork.back,
  });
}
function notificationRequest(c: Collection, n: Notification) {
  const url = new URL(n.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== originUrl(appOrigin())
  ) {
    console.error(
      "Notification links must use the configured HTTPS app origin.",
    );
    throw new Error(
      "This email is not ready to send because its link needs to be checked.",
    );
  }
  const actionLabels: Record<Notification["kind"], string> = {
    invitation: "Start your conversation",
    review_ready: "Review your stories",
    collection_ready: "See your stories",
    recipient_invitation: "Watch the collection",
    postcard_mailed: "View postcard status",
    postcard_followup: "Read the story",
    reply_invitation: "Send a reply",
    reply_received: "See their reply",
    living_story_request: "See your questions",
    living_story_published: "See the new story",
    address_request: "Add your mailing address",
    preparation_attention: "Check preparation",
    postcard_ready: "Review your postcards",
    postcard_attention: "Check the postcard hold",
  };
  const actionLabel = actionLabels[n.kind];
  const preference = ["postcard_followup", "reply_invitation"].includes(n.kind)
    ? "\nYou can turn off follow-up emails on your story page."
    : "";
  const message =
    n.kind === "invitation" && !n.text.includes(INTERVIEW_PACING_COPY)
      ? `${n.text}\n\n${INTERVIEW_PACING_COPY}\n\nYou can choose video with sound or audio only. You review your stories before anything is shared.`
      : n.text;
  const text = message + "\n\n" + actionLabel + ": " + n.url + preference;
  return JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: [n.to],
    subject: n.subject,
    text,
    html:
      `<!doctype html><html><body style="font-family:Arial,sans-serif;background:${BRAND_COLORS.paper};color:${BRAND_COLORS.espresso};max-width:600px;margin:32px auto;padding:24px;line-height:1.6"><img alt="Time Tapestry" width="190" height="57" style="display:block;width:190px;max-width:100%;height:auto;margin:0 0 32px" src="` +
      escapeHtml(url.origin + "/brand/time-tapestry-lockup.png") +
      '"><h1 style="font-family:Arial Rounded MT Bold,Arial,sans-serif;font-size:26px;line-height:1.3">' +
      escapeHtml(n.subject) +
      "</h1>" +
      message
        .split("\n")
        .map((p) => "<p>" + escapeHtml(p) + "</p>")
        .join("") +
      `<p><a style="display:inline-block;background:${BRAND_COLORS.espresso};color:${BRAND_COLORS.paper};padding:14px 22px;border-radius:12px;text-decoration:none" href="` +
      escapeHtml(n.url) +
      '">' +
      escapeHtml(actionLabel) +
      '</a></p><p style="font-size:13px">' +
      escapeHtml(preference.trim()) +
      `</p><p style="font-size:13px;color:${BRAND_COLORS.taupe};margin-top:32px">Time Tapestry · Stories woven together</p></body></html>`,
  });
}
class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
async function providerPost(
  provider: "lob" | "resend",
  body: string,
  idempotencyKey: string,
) {
  const isMail = provider === "lob";
  if (isMail && postcardDeliveryMode() !== "live")
    throw new ProviderError(
      "Postcard delivery is on hold until a live printing-service key is configured.",
      false,
    );
  const transport = isMail
    ? lobPostcardTransport(body)
    : { contentType: "application/json", body };
  let response: Response;
  try {
    response = await fetch(
      isMail
        ? "https://api.lob.com/v1/postcards"
        : "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": transport.contentType,
          "Idempotency-Key": idempotencyKey,
          Authorization: isMail
            ? "Basic " +
              Buffer.from(process.env.LOB_API_KEY + ":").toString("base64")
            : "Bearer " + process.env.RESEND_API_KEY,
        },
        body: transport.body,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      },
    );
  } catch (error) {
    console.error("Delivery request timed out or could not be confirmed.", {
      provider,
    });
    throw new ProviderError(
      "We could not confirm whether this was sent. You do not need to send it again.",
      true,
      { cause: error },
    );
  }
  if (!response.ok) {
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500 ||
      response.status === 409;
    console.error("Delivery provider request failed.", {
      provider,
      status: response.status,
    });
    throw new ProviderError(
      "We could not confirm whether this was sent. You do not need to send it again.",
      retryable,
    );
  }
  let result: { id?: unknown };
  try {
    result = await response.json();
  } catch {
    console.error("Delivery provider returned an unreadable response.", {
      provider,
    });
    throw new ProviderError(
      "We could not confirm whether this was sent. You do not need to send it again.",
      true,
    );
  }
  if (
    typeof result.id !== "string" ||
    !result.id.trim() ||
    (isMail && !/^psc_[a-zA-Z0-9]+$/.test(result.id))
  ) {
    console.error("Delivery provider returned no valid delivery identifier.", {
      provider,
    });
    throw new ProviderError(
      "We could not confirm whether this was sent. You do not need to send it again.",
      true,
    );
  }
  return result.id;
}
function claim(
  dispatch: DispatchState | undefined,
  idempotencyKey: string,
  requestBody: string,
  now: number,
): DispatchState {
  return {
    ...dispatch,
    attempts: (dispatch?.attempts || 0) + 1,
    firstAttemptAt: dispatch?.firstAttemptAt || iso(now),
    idempotencyKey: dispatch?.idempotencyKey || idempotencyKey,
    requestBody: dispatch?.requestBody || requestBody,
    leaseId: randomUUID(),
    leaseExpiresAt: iso(now + LEASE_MS),
    nextAttemptAt: undefined,
  };
}
function failedDispatch(dispatch: DispatchState, error: unknown, now: number) {
  const retryable = error instanceof ProviderError && error.retryable;
  const exhausted =
    (dispatch.attempts || 0) >= MAX_ATTEMPTS ||
    expiredRetryWindow(dispatch, now);
  return {
    ...dispatch,
    leaseId: undefined,
    leaseExpiresAt: undefined,
    reconciliationRequired: !retryable || exhausted,
    nextAttemptAt:
      retryable && !exhausted
        ? iso(
            now +
              Math.min(
                4 * 60 * 60 * 1000,
                60000 * 5 ** ((dispatch.attempts || 1) - 1),
              ),
          )
        : undefined,
  };
}

async function processPostcard(id: string, now: number, origin: string) {
  let snapshot = await getCollection(id);
  if (!snapshot) return false;
  if (
    snapshot.status === "approved" &&
    snapshot.addressConfirmed &&
    snapshot.address
  ) {
    snapshot = await mutateCollection(id, async (current) => {
      await prepareAutomaticPostcards(current, iso(now), origin);
      return current;
    });
  }
  // Legacy proofs and missing public-print approval remain held without consuming
  // provider attempts or turning a review requirement into a retry failure.
  if (snapshot.postcardPreparation?.status !== "ready") return false;
  const candidate = nextDuePostcard(snapshot, now);
  if (!candidate) return false;
  const configured = Boolean(
    process.env.LOB_API_KEY && process.env.LOB_FROM_ADDRESS_ID,
  );
  if (!configured) {
    console.error(
      "Postcard delivery requires LOB_API_KEY and LOB_FROM_ADDRESS_ID.",
    );
    await mutateCollection(id, (c) => {
      const d = c.deliveries.find(
        (item) => item.chapterId === candidate.chapterId,
      );
      if (d && !d.providerId)
        d.error =
          "Postcard delivery is not ready yet. This postcard is waiting to send.";
      return c;
    });
    return false;
  }
  let body: string;
  try {
    body = await postcardRequest(snapshot, candidate.chapterId, origin);
    if (
      candidate.dispatch?.requestBody &&
      candidate.dispatch.requestBody !== body
    )
      throw new Error(
        "This postcard's saved print request differs from its approved snapshot. The team needs to reconcile it before another attempt.",
      );
  } catch (error) {
    await mutateCollection(id, (c) => {
      const d = c.deliveries.find(
        (item) => item.chapterId === candidate.chapterId,
      );
      if (d && !d.providerId) {
        d.status = "failed";
        d.error =
          error instanceof Error
            ? error.message
            : "Postcard preparation failed.";
        d.dispatch = { ...d.dispatch, reconciliationRequired: true };
        holdPostcardsForAttention(c, d.error, iso(now), origin);
      }
      return c;
    });
    return false;
  }
  let lease: DispatchState | undefined;
  await mutateCollection(id, (c) => {
    if (c.updatedAt !== snapshot.updatedAt) return c;
    const d = nextDuePostcard(c, now);
    if (!d || d.chapterId !== candidate.chapterId) return c;
    if (expiredRetryWindow(d.dispatch, now)) {
      console.error(
        "Postcard retry window expired. Reconcile the saved request with Lob before retrying.",
      );
      d.status = "failed";
      d.error =
        "We could not confirm whether this postcard was sent. The Time Tapestry team needs to check before another attempt.";
      d.dispatch = { ...d.dispatch, reconciliationRequired: true };
      holdPostcardsForAttention(c, d.error, iso(now), origin);
      return c;
    }
    d.dispatch = claim(
      d.dispatch,
      postcardIdempotencyKey(c, d.chapterId),
      body,
      now,
    );
    d.error = undefined;
    lease = d.dispatch;
    return c;
  });
  if (!lease) return false;
  try {
    const providerId = await withPipelineStage(
      "LOB_DISPATCH",
      pipelineContext(id),
      () => providerPost("lob", lease!.requestBody!, lease!.idempotencyKey!),
      "lob",
    );
    await mutateCollection(id, (c) => {
      const d = c.deliveries.find(
        (item) => item.chapterId === candidate.chapterId,
      );
      if (d && d.dispatch && d.dispatch.leaseId === lease!.leaseId) {
        d.providerId = providerId;
        d.status = "submitted";
        d.error = undefined;
        d.dispatch = {
          ...d.dispatch,
          leaseId: undefined,
          leaseExpiresAt: undefined,
        };
      }
      return c;
    });
  } catch (error) {
    await mutateCollection(id, (c) => {
      const d = c.deliveries.find(
        (item) => item.chapterId === candidate.chapterId,
      );
      if (d && d.dispatch && d.dispatch.leaseId === lease!.leaseId) {
        d.status = "failed";
        d.error =
          error instanceof Error
            ? error.message
            : "Postcard delivery could not be confirmed.";
        d.dispatch = failedDispatch(d.dispatch, error, Date.now());
        if (d.dispatch.reconciliationRequired)
          holdPostcardsForAttention(
            c,
            "Postcard delivery stopped after an unresolved request. Contact the Time Tapestry team using your private collection link before another attempt. Saved printing requests are preserved.",
            iso(now),
            origin,
          );
      }
      return c;
    });
  }
  return true;
}

/** Drop notices that later work made obsolete so they cannot take the one send slot. */
async function suppressSupersededNotifications(id: string) {
  const now = Date.now();
  await mutateCollection(id, async (c) => {
    for (const n of c.notifications) {
      if (!notificationNeedsAttempt(n, now)) continue;
      const reason = await currentNotificationSuppressionReason(c, n);
      if (!reason) continue;
      n.status = "suppressed";
      n.error = reason;
      n.dispatch = {
        ...n.dispatch,
        leaseId: undefined,
        leaseExpiresAt: undefined,
      };
    }
    return c;
  });
}

/** Recheck current private film storage before claiming or sending its ready email. */
export async function currentNotificationSuppressionReason(
  c: Collection,
  n: Notification,
) {
  const reason = notificationSuppressionReason(c, n);
  if (!reason && n.kind === "living_story_published") {
    const moment = c.livingStory?.moments.find(
      (item) => item.id === n.livingStoryMomentId,
    );
    const media = moment?.videoMediaId && (await getMedia(moment.videoMediaId));
    if (
      !moment ||
      !media ||
      media.collectionId !== c.id ||
      media.role !== "owner" ||
      media.provenance !== "generated_film" ||
      media.livingStoryMomentId !== moment.id ||
      media.originalSourceMediaId !== moment.sourceMediaId ||
      media.mimeType !== "video/mp4" ||
      media.bytes <= 0 ||
      !(media.localPath || media.url)
    )
      return "This new story is waiting for verified private film storage.";
  }
  if (!reason && n.kind === "preparation_attention") {
    const workId = n.id.slice(`${c.id}:preparation-attention:`.length);
    if (workId.startsWith("prep_")) {
      const { getInterviewPreparationJob } =
        await import("./interview-preparation");
      const preparation = await getInterviewPreparationJob(workId);
      if (
        c.interviewPreparation?.id !== workId ||
        preparation?.status !== "needs_attention"
      )
        return "This preparation no longer needs attention.";
    } else {
      const { getFilmJob, latestFilmJob, filmJobInputsCurrent } =
        await import("./films/jobstore");
      const job = await getFilmJob(workId);
      if (
        !job ||
        job.status !== "failed" ||
        (await latestFilmJob(c.id))?.id !== workId ||
        !(await filmJobInputsCurrent(job, c))
      )
        return "This film preparation no longer needs attention.";
    }
  }
  if (
    !reason &&
    (n.id.startsWith(`${c.id}:playback-ready:`) ||
      n.id.startsWith(`${c.id}:export-ready:`))
  ) {
    const exporting = n.id.startsWith(`${c.id}:export-ready:`);
    const jobId = n.id.slice(
      `${c.id}:${exporting ? "export" : "playback"}-ready:`.length,
    );
    const { getFilmJob, latestFilmJob } = await import("./films/jobstore");
    const { playbackReady, playbackExportReady } = await import("./playback");
    const job = await getFilmJob(jobId);
    if (
      !job ||
      job.status !== "ready" ||
      (exporting
        ? !(await playbackExportReady(c, job))
        : (await latestFilmJob(c.id))?.id !== jobId ||
          !(await playbackReady(c, job)))
    )
      return "This chapter notice is waiting for the current verified private outputs.";
    return null;
  }
  if (reason || !n.id.startsWith(`${c.id}:films-ready:`)) return reason;
  const { getFilmJob, latestFilmJob, filmJobInputsCurrent } =
    await import("./films/jobstore");
  const jobId = n.id.slice(`${c.id}:films-ready:`.length);
  const job = await getFilmJob(jobId);
  if (
    !job ||
    job.mode !== "original" ||
    (await latestFilmJob(c.id))?.id !== jobId ||
    !(await filmJobInputsCurrent(job, c))
  )
    return "This review email does not match the current recorded film version.";
  for (const chapter of c.chapters) {
    const artifact = job.chapters.find(
      (item) => item.chapterId === chapter.id,
    )?.artifact;
    const media =
      chapter.videoMediaId && (await getMedia(chapter.videoMediaId));
    if (
      !artifact ||
      artifact.outputSha256 !== chapter.film?.outputSha256 ||
      artifact.mediaId !== chapter.videoMediaId ||
      !media ||
      media.collectionId !== c.id ||
      media.role !== "owner" ||
      media.mimeType !== "video/mp4" ||
      media.bytes <= 0 ||
      !(media.localPath || media.url)
    )
      return "The four recorded films are waiting for verified private storage.";
  }
  return null;
}

async function processNotification(
  id: string,
  notificationId: string,
  now: number,
  origin: string,
) {
  const snapshot = await getCollection(id);
  // Sent and not-yet-due mail must not open a collection write. Doing so on
  // every worker pass used to change updatedAt and reject the current
  // full-interview choice.
  if (
    !notificationNeedsAttempt(
      snapshot?.notifications.find((item) => item.id === notificationId),
      now,
    )
  )
    return false;
  let lease: DispatchState | undefined;
  await mutateCollection(id, async (c) => {
    const n = c.notifications.find((item) => item.id === notificationId);
    if (!notificationNeedsAttempt(n, now)) return c;
    const suppression = await currentNotificationSuppressionReason(c, n);
    if (suppression) {
      n.status = "suppressed";
      n.error = suppression;
      return c;
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      console.error(
        "Email delivery requires RESEND_API_KEY and a verified RESEND_FROM_EMAIL.",
      );
      n.error =
        "Email delivery is not ready yet. This email is waiting to send.";
      return c;
    }
    if (expiredRetryWindow(n.dispatch, now)) {
      console.error(
        "Email retry window expired. Reconcile the saved request with Resend before retrying.",
      );
      n.status = "failed";
      n.error =
        "We could not confirm whether this email was sent. The Time Tapestry team needs to check before another attempt.";
      n.dispatch = { ...n.dispatch, reconciliationRequired: true };
      return c;
    }
    if (n.kind === "postcard_followup" && !n.dispatch?.firstAttemptAt) {
      const d = c.deliveries.find((item) => item.chapterId === n.chapterId)!;
      const refreshed = postcardFollowup(c, d, origin);
      n.subject = refreshed.subject;
      n.text = refreshed.text;
      n.url = refreshed.url;
      n.dueAt = refreshed.dueAt;
      if (time(n.dueAt) > now) return c;
    }
    try {
      n.dispatch = claim(
        n.dispatch,
        "time-tapestry/email/" + n.id,
        n.dispatch?.requestBody || notificationRequest(c, n),
        now,
      );
    } catch (error) {
      n.status = "failed";
      n.error =
        error instanceof Error ? error.message : "Email preparation failed.";
      n.dispatch = { ...n.dispatch, reconciliationRequired: true };
      return c;
    }
    n.error = undefined;
    lease = n.dispatch;
    return c;
  });
  if (!lease) return false;
  // A removal may have been saved after claiming an invitation. Check the
  // current membership again immediately before contacting the email provider.
  const current = await getCollection(id);
  const currentNotification = current?.notifications.find(
    (item) => item.id === notificationId,
  );
  if (
    !current ||
    !currentNotification ||
    currentNotification.status === "suppressed" ||
    currentNotification.dispatch?.leaseId !== lease.leaseId ||
    (await currentNotificationSuppressionReason(current, currentNotification))
  ) {
    if (currentNotification)
      await mutateCollection(id, async (c) => {
        const n = c.notifications.find((item) => item.id === notificationId);
        if (n && n.dispatch?.leaseId === lease!.leaseId) {
          n.status = "suppressed";
          n.error =
            (await currentNotificationSuppressionReason(c, n)) ||
            "This email is no longer eligible to send.";
          n.dispatch = {
            ...n.dispatch,
            leaseId: undefined,
            leaseExpiresAt: undefined,
          };
        }
        return c;
      });
    return false;
  }
  try {
    const providerId = await withPipelineStage(
      "EMAIL_NOTIFY",
      pipelineContext(id),
      () => providerPost("resend", lease!.requestBody!, lease!.idempotencyKey!),
      "resend",
    );
    await mutateCollection(id, (c) => {
      const n = c.notifications.find((item) => item.id === notificationId);
      if (n && n.dispatch && n.dispatch.leaseId === lease!.leaseId) {
        n.status = "sent";
        n.providerId = providerId;
        n.sentAt = iso(Date.now());
        n.error = undefined;
        n.dispatch = {
          ...n.dispatch,
          leaseId: undefined,
          leaseExpiresAt: undefined,
        };
      }
      return c;
    });
  } catch (error) {
    await mutateCollection(id, (c) => {
      const n = c.notifications.find((item) => item.id === notificationId);
      if (n && n.dispatch && n.dispatch.leaseId === lease!.leaseId) {
        n.status = "failed";
        n.error =
          error instanceof Error
            ? error.message
            : "Email delivery could not be confirmed.";
        n.dispatch = failedDispatch(n.dispatch, error, Date.now());
      }
      return c;
    });
  }
  return true;
}

export const emailDeliveryEnabled = () =>
  process.env.COLLECTION_EMAIL_ENABLED === "true" ||
  process.env.COLLECTION_DELIVERY_ENABLED === "true";
export const postalDeliveryEnabled = () =>
  process.env.COLLECTION_DELIVERY_ENABLED === "true";

/** Run from a protected recurring job. Never called during page views. */
export async function processDeliveryJobs() {
  if (!emailDeliveryEnabled() && !postalDeliveryEnabled())
    throw new Error("Collection delivery is disabled.");
  const origin = originUrl(appOrigin());
  const collections = (await listCollections()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  // Persist the last visited collection so a busy account cannot monopolize
  // the bounded provider budget across recurring passes or worker restarts.
  const cursor = await readRecord<{ afterId?: string }>(
    "delivery-queue-cursor",
  );
  const split = cursor?.afterId
    ? collections.findIndex((entry) => entry.id > cursor.afterId!)
    : 0;
  const ordered =
    split > 0
      ? [...collections.slice(split), ...collections.slice(0, split)]
      : collections;
  const deadline = Date.now() + 40000;
  let providerAttempts = 0;
  let inspected = 0;
  for (const entry of ordered) {
    if (Date.now() > deadline || providerAttempts >= 3) break;
    inspected += 1;
    if (
      postalDeliveryEnabled() &&
      (await processPostcard(entry.id, Date.now(), origin))
    )
      providerAttempts += 1;
    if (emailDeliveryEnabled()) {
      await suppressSupersededNotifications(entry.id);
      const current = await getCollection(entry.id);
      for (const n of notificationsInDeliveryOrder(
        current?.notifications ?? [],
      )) {
        if (Date.now() > deadline || providerAttempts >= 3) break;
        if (await processNotification(entry.id, n.id, Date.now(), origin)) {
          providerAttempts += 1;
          break;
        }
      }
    }
    await mutateRecord<{ afterId: string }>("delivery-queue-cursor", () => ({
      afterId: entry.id,
    }));
  }
  return { inspected, providerAttempts };
}
