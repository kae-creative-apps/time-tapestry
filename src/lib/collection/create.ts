import { randomBytes, randomUUID } from "node:crypto";
import { appOrigin, linksFor, publicView } from "./access";
import { INTERVIEW_PACING_COPY } from "./interview-progress";
import type { Collection, Contact, PostalAddress } from "./types";

const clean = (v: unknown, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export class CollectionInputError extends Error {}

function contact(value: unknown): Contact {
  const input = object(value);
  const name = clean(input.name);
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!name || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
    throw new CollectionInputError(
      "Name and a valid email are required for each person.",
    );
  return { name, email, phone: clean(input.phone, 40) };
}

/** Validate and prepare a collection without sending mail or writing storage. */
export function prepareCollection(value: unknown): Collection {
  const b = object(value);
  if (b.initiationPath !== "share" && b.initiationPath !== "request")
    throw new CollectionInputError("Choose share or request.");
  const storyteller = contact(b.storyteller);
  const recipient = contact(b.recipient);
  const requester = contact(
    b.requester || (b.initiationPath === "share" ? b.storyteller : b.recipient),
  );
  const postal = object(b.address);
  let address: PostalAddress | undefined;
  if (postal.line1) {
    address = {
      name: recipient.name,
      line1: clean(postal.line1),
      line2: clean(postal.line2),
      city: clean(postal.city),
      region: clean(postal.region),
      postalCode: clean(postal.postalCode, 30),
      country: clean(postal.country, 2).toUpperCase() || "US",
    };
    if (
      !address.line1 ||
      !address.city ||
      !address.region ||
      !address.postalCode
    )
      throw new CollectionInputError(
        "Please complete the address, or choose to collect it later.",
      );
  }
  const now = new Date().toISOString();
  const key = () => randomBytes(32).toString("hex");
  const c: Collection = {
    schemaVersion: 2,
    postcardCadence: "biweekly",
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: b.initiationPath === "request" ? "invited" : "recording",
    ownerKey: key(),
    recipientKey: key(),
    requesterKey: key(),
    initiationPath: b.initiationPath,
    storyteller,
    recipient,
    requester,
    address,
    addressConfirmed: Boolean(address),
    invitationNote: clean(b.invitationNote, 2000),
    faithFraming: "faith",
    currentQuestion: 0,
    chapterBlessings: {},
    takes: [],
    selectedTakeIds: {},
    followUps: {},
    chapters: [],
    deliveries: [],
    replies: [],
    notifications: [],
    recipientViewedChapters: {},
    replyRemindersEnabled: true,
  };
  if (c.initiationPath === "request")
    c.notifications.push({
      id: `${c.id}:invitation`,
      kind: "invitation",
      to: storyteller.email,
      subject: `${requester.name} would like to hear your story`,
      text: `${requester.name} has invited you to share stories from your life. ${c.invitationNote}\n\n${INTERVIEW_PACING_COPY}\n\nYou can choose video with sound or audio only. You review your stories before anything is shared.`,
      url: appOrigin() + linksFor(c).interview,
      dueAt: now,
      status: "pending",
    });
  return c;
}

export function collectionNextUrl(c: Collection) {
  return c.initiationPath === "share"
    ? linksFor(c).interview
    : `/collection/${c.id}?key=${c.requesterKey}`;
}

export function collectionCreationResult(c: Collection) {
  return {
    collection: publicView(
      c,
      c.initiationPath === "share" ? "owner" : "requester",
    ),
    nextUrl: collectionNextUrl(c),
    invitationStatus: c.initiationPath === "request" ? "pending" : undefined,
  };
}
