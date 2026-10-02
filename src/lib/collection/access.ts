import { timingSafeEqual } from "node:crypto";
import type { Collection, CollectionView } from "./types";
export function secretMatches(a: string, b: string) {
  return Boolean(
    a &&
    b &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b)),
  );
}
export function roleFor(
  c: Collection,
  key: string,
): CollectionView["role"] | null {
  if (secretMatches(c.ownerKey, key)) return "owner";
  if (secretMatches(c.recipientKey, key)) return "recipient";
  if (secretMatches(c.requesterKey, key)) return "requester";
  return null;
}
export const appOrigin = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3107").replace(
    /\/$/,
    "",
  );
export function linksFor(c: Collection) {
  return {
    interview: `/record/${c.id}?key=${c.ownerKey}`,
    review: `/collection/${c.id}/review?key=${c.ownerKey}`,
    collection: `/collection/${c.id}?key=${c.recipientKey}`,
    address: `/collection/${c.id}/address?key=${c.recipientKey}`,
  };
}
export function publicView(
  c: Collection,
  role: CollectionView["role"],
): CollectionView {
  const { ownerKey, recipientKey, requesterKey, ...view } = structuredClone(c);
  void ownerKey;
  void recipientKey;
  void requesterKey;
  view.deliveries = view.deliveries.map(
    ({ dispatch, ...delivery }) => delivery,
  );
  view.notifications = view.notifications.map(
    ({ dispatch, ...notification }) => notification,
  );
  if (role !== "owner") {
    view.takes = [];
    view.selectedTakeIds = {};
    view.followUps = {};
    view.notifications = [];
    view.deliveries = view.deliveries.map(
      ({ dispatch, ...delivery }) => delivery,
    );
    if (c.status !== "approved" || role === "requester") {
      view.chapters = [];
      view.chapterBlessings = {};
    }
    view.explicitTakeSelections = undefined;
    view.invitationNote = "";
    view.draftHistory = undefined;
    if (role === "requester") {
      view.chapterBlessings = {};
      view.replies = [];
    }
    view.storyteller = { name: c.storyteller.name, email: "" };
    view.requester = { name: c.requester.name, email: "" };
    if (role === "requester" && c.requester.email !== c.recipient.email) {
      view.address = undefined;
      view.recipient = { name: c.recipient.name, email: "" };
      view.replies = [];
    }
  }
  return {
    ...view,
    role,
    links: role === "owner" ? linksFor(c) : undefined,
    capabilities: {
      tts: Boolean(process.env.ELEVENLABS_API_KEY),
      transcription: Boolean(process.env.OPENAI_API_KEY),
      ai: Boolean(process.env.GLOO_API_KEY),
      mail: Boolean(process.env.LOB_API_KEY && process.env.LOB_FROM_ADDRESS_ID),
      email: Boolean(process.env.RESEND_API_KEY),
      media: !process.env.VERCEL || Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      directUpload: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
  };
}
export function requireOwner(c: Collection, role: string | null) {
  if (role !== "owner") throw new Error("The storyteller link is required.");
  if (c.status === "approved")
    throw new Error(
      "This approved collection is fixed. Contact support to create a corrected version.",
    );
}
