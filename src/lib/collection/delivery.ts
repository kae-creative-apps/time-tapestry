import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { addCalendarMonths } from "./content";
import { appOrigin } from "./access";
import { getCollection, listCollections, mutateCollection } from "./store";
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
export const POSTCARD_COPY_LIMIT = 1000;

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
function originUrl(origin: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password) {
    console.error(
      "Delivery requires NEXT_PUBLIC_APP_URL to be a public HTTPS app origin.",
    );
    throw new Error(
      "Delivery is not ready yet because the story link needs a secure HTTPS address.",
    );
  }
  return url.origin;
}
export function recipientChapterUrl(
  c: Collection,
  chapterId: string,
  origin = appOrigin(),
) {
  return (
    originUrl(origin) +
    "/collection/" +
    encodeURIComponent(c.id) +
    "/chapter/" +
    encodeURIComponent(chapterId) +
    "?key=" +
    encodeURIComponent(c.recipientKey)
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
          time(addCalendarMonths(previous.mailedAt, 3)),
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
    const minimum = addCalendarMonths(mailedAt, (nextIndex - index) * 3);
    if (time(delivery.scheduledFor) < time(minimum))
      delivery.scheduledFor = minimum;
  });
}

export function notificationSuppressionReason(
  c: Collection,
  n: Notification,
): string | null {
  if (n.kind === "collection_ready")
    return "The first postcard introduces the gift, so this email is not sent.";
  if (n.kind === "invitation" && c.status !== "invited")
    return "The storyteller has already started or completed the interview.";
  if (n.kind === "review_ready" && c.status !== "draft")
    return "This draft is no longer awaiting review.";
  if (n.kind === "address_request" && c.addressConfirmed)
    return "The mailing address has already been confirmed.";
  if (n.kind === "postcard_mailed" && n.to !== c.storyteller.email)
    return "Postcard status emails go only to the storyteller.";
  if (["postcard_followup", "reply_invitation"].includes(n.kind)) {
    if (c.status !== "approved")
      return "The stories have not been approved for sharing.";
    if (!c.replyRemindersEnabled)
      return "The recipient turned off follow-up emails.";
    if (c.replies.some((r) => r.chapterId === n.chapterId))
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
  rawBody: string,
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
    .update(timestamp + "." + rawBody)
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
  } else if (
    ["postcard.failed", "postcard.rejected", "postcard.deleted"].includes(type)
  ) {
    delivery.status = "failed";
    delivery.error =
      "The printing service reported that this postcard failed or was canceled. The Time Tapestry team needs to check before another attempt.";
    delivery.dispatch = { ...delivery.dispatch, reconciliationRequired: true };
    delivery.mailEvent = type;
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

export async function postcardArtwork(
  c: Collection,
  chapterId: string,
  origin = appOrigin(),
) {
  const chapter = c.chapters.find((ch) => ch.id === chapterId);
  if (!chapter || !chapter.editorialReviewed || c.status !== "approved")
    throw new Error("Approve the story before mailing.");
  const message = c.chapterBlessings[chapterId];
  const copy = [
    chapter.postcardNote,
    message?.encouragement,
    message?.scriptureText,
    message?.scriptureReference,
    message?.scriptureTranslation,
  ].filter(Boolean);
  if (copy.join("").length > POSTCARD_COPY_LIMIT)
    throw new Error(
      "Postcard copy exceeds 1000 characters. Create a shorter approved postcard revision before mailing.",
    );
  const qr = await QRCode.toDataURL(recipientChapterUrl(c, chapterId, origin), {
    errorCorrectionLevel: "M",
    width: 600,
    margin: 4,
  });
  const note = "<p>" + escapeHtml(chapter.postcardNote) + "</p>";
  const encouragement = message?.encouragement
    ? "<p>" + escapeHtml(message.encouragement) + "</p>"
    : "";
  const scripture = message?.scriptureText
    ? '<p class="scripture">' + escapeHtml(message.scriptureText) + "</p>"
    : "";
  const attribution = [
    message?.scriptureReference,
    message?.scriptureTranslation,
  ]
    .filter(Boolean)
    .join(" · ");
  const front =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    "*{box-sizing:border-box}body{position:relative;width:6.25in;height:4.25in;margin:0;background:#fbf9f3;color:#192f38;font:12pt/1.25 Georgia,serif}" +
    ".content{position:absolute;left:.375in;top:.30in;width:5.5in}h1{font-size:21pt;line-height:1.1;margin:.10in 0 .15in}p{margin:0 0 .11in;overflow-wrap:anywhere}.label{font:9pt Arial,sans-serif;letter-spacing:1px}.scripture{font-style:italic}.reference{font-size:10pt}" +
    '</style></head><body><div class="content"><div class="label">TIME TAPESTRY · STORIES WOVEN TOGETHER</div><h1>' +
    escapeHtml(chapter.title) +
    '</h1><p class="label">From ' +
    escapeHtml(c.storyteller.name) +
    "</p>" +
    note +
    encouragement +
    scripture +
    (attribution
      ? '<p class="reference">' + escapeHtml(attribution) + "</p>"
      : "") +
    "</div></body></html>";
  // Lob's official 4x6 template reserves the lower-right 3.2835in x 2.375in.
  const back =
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    "*{box-sizing:border-box}body{position:relative;width:6.25in;height:4.25in;margin:0;background:white;color:#192f38;font:12pt/1.3 Arial,sans-serif}" +
    ".intro{position:absolute;top:.35in;left:.35in;width:5.5in}.qr{position:absolute;left:.35in;top:1.6in;width:1.5in;height:1.5in}.caption{position:absolute;left:.35in;top:3.1in;width:2.2in;font-size:10pt}" +
    ".ink-free{position:absolute;right:.275in;bottom:.25in;width:3.2835in;height:2.375in;background:white}" +
    '</style></head><body><div class="intro">A story from ' +
    escapeHtml(c.storyteller.name) +
    ", made for " +
    escapeHtml(c.recipient.name) +
    '.<br>Scan to read all four stories and watch any included videos.</div><img class="qr" alt="Open your stories" src="' +
    qr +
    '"><div class="caption">You can send a video or written message back from the story page.<br>Keep this card and its private link.</div><div class="ink-free"></div></body></html>';
  return { front, back };
}
async function postcardRequest(
  c: Collection,
  chapterId: string,
  origin: string,
) {
  if (!c.addressConfirmed || !c.address)
    throw new Error("A confirmed mailing address is required.");
  const a = c.address;
  const artwork = await postcardArtwork(c, chapterId, origin);
  return JSON.stringify({
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
    from: process.env.LOB_FROM_ADDRESS_ID,
    size: "4x6",
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
    invitation: "Start your interview",
    review_ready: "Review your stories",
    collection_ready: "See your stories",
    postcard_mailed: "View postcard status",
    postcard_followup: "Read the story",
    reply_invitation: "Send a reply",
    reply_received: "See their reply",
    address_request: "Add your mailing address",
  };
  const actionLabel = actionLabels[n.kind];
  const preference = ["postcard_followup", "reply_invitation"].includes(n.kind)
    ? "\nYou can turn off follow-up emails on your story page."
    : "";
  const text = n.text + "\n\n" + actionLabel + ": " + n.url + preference;
  return JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: [n.to],
    subject: n.subject,
    text,
    html:
      '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#192f38;max-width:600px;margin:32px auto;line-height:1.6"><h1 style="font-size:24px">' +
      escapeHtml(n.subject) +
      "</h1>" +
      n.text
        .split("\n")
        .map((p) => "<p>" + escapeHtml(p) + "</p>")
        .join("") +
      '<p><a href="' +
      escapeHtml(n.url) +
      '">' +
      escapeHtml(actionLabel) +
      '</a></p><p style="font-size:13px">' +
      escapeHtml(preference.trim()) +
      '</p><p style="font-size:13px">Time Tapestry · Stories woven together</p></body></html>',
  });
}
class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
async function providerPost(
  provider: "lob" | "resend",
  body: string,
  idempotencyKey: string,
) {
  const isMail = provider === "lob";
  let response: Response;
  try {
    response = await fetch(
      isMail
        ? "https://api.lob.com/v1/postcards"
        : "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          Authorization: isMail
            ? "Basic " +
              Buffer.from(process.env.LOB_API_KEY + ":").toString("base64")
            : "Bearer " + process.env.RESEND_API_KEY,
        },
        body,
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    console.error("Delivery request timed out or could not be confirmed.", {
      provider,
    });
    throw new ProviderError(
      "We could not confirm whether this was sent. You do not need to send it again.",
      true,
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
  const snapshot = await getCollection(id);
  if (!snapshot) return false;
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
    body =
      candidate.dispatch?.requestBody ||
      (await postcardRequest(snapshot, candidate.chapterId, origin));
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
    const providerId = await providerPost(
      "lob",
      lease.requestBody!,
      lease.idempotencyKey!,
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
      }
      return c;
    });
  }
  return true;
}

async function processNotification(
  id: string,
  notificationId: string,
  now: number,
  origin: string,
) {
  let lease: DispatchState | undefined;
  await mutateCollection(id, (c) => {
    const n = c.notifications.find((item) => item.id === notificationId);
    if (
      !n ||
      !["pending", "failed"].includes(n.status) ||
      time(n.dueAt) > now ||
      !canRetry(n.dispatch, now)
    )
      return c;
    const suppression = notificationSuppressionReason(c, n);
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
  try {
    const providerId = await providerPost(
      "resend",
      lease.requestBody!,
      lease.idempotencyKey!,
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

/** Run explicitly from a protected job invocation. Never called during page views. */
export async function processDeliveryJobs() {
  if (process.env.COLLECTION_DELIVERY_ENABLED !== "true")
    throw new Error("Collection delivery is disabled.");
  const origin = originUrl(appOrigin());
  const collections = await listCollections();
  const deadline = Date.now() + 40000;
  let providerAttempts = 0;
  let inspected = 0;
  for (const entry of collections) {
    if (Date.now() > deadline || providerAttempts >= 3) break;
    inspected += 1;
    if (await processPostcard(entry.id, Date.now(), origin))
      providerAttempts += 1;
    const current = await getCollection(entry.id);
    if (!current) continue;
    for (const n of current.notifications) {
      if (Date.now() > deadline || providerAttempts >= 3) break;
      if (await processNotification(entry.id, n.id, Date.now(), origin))
        providerAttempts += 1;
    }
  }
  return { inspected, providerAttempts };
}
