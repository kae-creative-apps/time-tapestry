import { createHash } from "node:crypto";
import { appOrigin } from "./access";
import { addCalendarMonths } from "./content";
import { PostcardLayoutError } from "./postcard-fit";
import { originUrl, postcardArtwork } from "./postcard-artwork";
import type { Collection, PostalAddress } from "./types";

export type PostcardProofSnapshot = {
  version: 1;
  hash: string;
  sourceHash: string;
  collectionVersion: number;
  origin: string;
  address: PostalAddress;
  firstMailingAt: string;
  cards: Array<{
    chapterId: string;
    title: string;
    note: string;
    scheduledFor: string;
    front: string;
    back: string;
  }>;
  approvedAt?: string;
  releaseStatus: "held" | "released";
  releasedAt?: string;
};
export class PostcardProofError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const addressValue = (address: PostalAddress) => ({
  name: address.name.trim(),
  line1: address.line1.trim(),
  line2: (address.line2 || "").trim(),
  city: address.city.trim(),
  region: address.region.trim(),
  postalCode: address.postalCode.trim(),
  country: address.country.trim().toUpperCase(),
});
export function postcardFirstDate(value: unknown) {
  if (typeof value !== "string")
    throw new PostcardProofError("Choose a first mailing date.");
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new PostcardProofError("Choose a valid first mailing date.");
  const normalized = `${date}T12:00:00.000Z`;
  if (
    !Number.isFinite(Date.parse(normalized)) ||
    new Date(normalized).toISOString().slice(0, 10) !== date
  )
    throw new PostcardProofError("Choose a valid first mailing date.");
  return normalized;
}
function sourceHash(c: Collection, origin: string) {
  if (
    c.status !== "approved" ||
    c.chapters.length !== 4 ||
    !c.chapters.every((chapter) => chapter.editorialReviewed)
  )
    throw new PostcardProofError(
      "Approve all four stories before approving the print proof.",
    );
  if (!c.addressConfirmed || !c.address)
    throw new PostcardProofError("Save and confirm the mailing address first.");
  const address = addressValue(c.address);
  if (
    ![
      address.name,
      address.line1,
      address.city,
      address.region,
      address.postalCode,
    ].every(Boolean) ||
    address.country !== "US"
  )
    throw new PostcardProofError(
      "Confirm a complete US mailing address before preparing postcards.",
    );
  return digest([
    c.id,
    c.approvedVersion || 1,
    origin,
    c.recipientKey,
    c.storyteller.name,
    c.recipient.name,
    address,
    c.chapters.map((chapter) => [
      chapter.id,
      chapter.title,
      chapter.content,
      chapter.postcardNote,
      chapter.videoMediaId || "",
      chapter.film?.outputSha256 || "",
      c.chapterBlessings[chapter.id] || null,
    ]),
  ]);
}
function proofHash(
  proof: Omit<PostcardProofSnapshot, "hash"> | PostcardProofSnapshot,
) {
  return digest([
    proof.version,
    proof.sourceHash,
    proof.collectionVersion,
    proof.origin,
    addressValue(proof.address),
    proof.firstMailingAt,
    proof.cards.map((card) => [
      card.chapterId,
      card.title,
      card.note,
      card.scheduledFor,
      card.front,
      card.back,
    ]),
  ]);
}
export async function buildPostcardProof(
  c: Collection,
  firstMailingAt: string,
  origin = appOrigin(),
): Promise<PostcardProofSnapshot> {
  const secureOrigin = originUrl(origin);
  const source = sourceHash(c, secureOrigin);
  const first = postcardFirstDate(firstMailingAt);
  const cards = await Promise.all(
    c.chapters.map(async (chapter, index) => ({
      chapterId: chapter.id,
      title: chapter.title,
      note: chapter.postcardNote,
      scheduledFor: addCalendarMonths(first, index * 3),
      ...(await postcardArtwork(c, chapter.id, secureOrigin)),
    })),
  );
  const proof = {
    version: 1 as const,
    sourceHash: source,
    collectionVersion: c.approvedVersion || 1,
    origin: secureOrigin,
    address: addressValue(c.address!),
    firstMailingAt: first,
    cards,
    releaseStatus: "held" as const,
  };
  return { ...proof, hash: proofHash(proof) };
}
export function postcardProofIsCurrent(
  c: Collection,
  proof = c.postcardProof,
  origin = appOrigin(),
) {
  try {
    return Boolean(
      proof &&
      proof.hash === proofHash(proof) &&
      proof.sourceHash === sourceHash(c, originUrl(origin)),
    );
  } catch {
    return false;
  }
}
export function approvePostcardProof(
  c: Collection,
  proof: PostcardProofSnapshot,
  expectedHash: string,
  now = new Date().toISOString(),
) {
  if (
    proof.hash !== expectedHash ||
    !postcardProofIsCurrent(c, proof, proof.origin)
  )
    throw new PostcardProofError(
      "The wording, address or schedule changed. Open the current proof and review it again.",
      409,
    );
  if (c.postcardProof?.hash === proof.hash && c.postcardProof.approvedAt)
    return c;
  if (
    c.deliveries.some(
      (delivery) =>
        delivery.providerId || (delivery.dispatch?.attempts || 0) > 0,
    )
  )
    throw new PostcardProofError(
      "A mailing is already in progress. Ask the team to resolve it before changing the print proof.",
      409,
    );
  if (c.postcardProof?.approvedAt)
    c.postcardProofHistory = [
      ...(c.postcardProofHistory || []),
      structuredClone(c.postcardProof),
    ];
  c.postcardProof = {
    ...structuredClone(proof),
    approvedAt: now,
    releaseStatus: "held",
  };
  // A new proof is held. Any untouched old schedule must not remain dispatchable.
  c.deliveries = [];
  return c;
}
export function postcardDeliveryReadiness(origin = appOrigin()) {
  const reasons: string[] = [];
  if (process.env.COLLECTION_DELIVERY_ENABLED !== "true")
    reasons.push("Mailing is not enabled.");
  if (!process.env.LOB_API_KEY || !process.env.LOB_FROM_ADDRESS_ID)
    reasons.push("The printing service is not connected.");
  if (!process.env.LOB_WEBHOOK_SECRET)
    reasons.push("Mailing confirmation is not configured.");
  if (!process.env.CRON_SECRET)
    reasons.push("The delivery worker is not configured.");
  try {
    const url = new URL(originUrl(origin));
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      !host.includes(".") ||
      /(^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\.|\.(test|invalid|localhost|local)$)/.test(
        host,
      ) ||
      host.includes(":")
    )
      throw new Error();
  } catch {
    reasons.push("The printed QR code needs a public HTTPS website address.");
  }
  return { ready: reasons.length === 0, reasons };
}
export function assertReleasedPostcardProof(
  c: Collection,
  origin = appOrigin(),
): PostcardProofSnapshot {
  const proof = c.postcardProof;
  if (
    !proof?.approvedAt ||
    proof.releaseStatus !== "released" ||
    !postcardProofIsCurrent(c, proof, origin)
  )
    throw new PostcardProofError(
      "Postcard mailing is on hold until the current print proof is approved and released.",
      409,
    );
  return proof;
}
export function releasePostcardProof(
  c: Collection,
  expectedHash: string,
  now = new Date().toISOString(),
  origin = appOrigin(),
) {
  if (!c.addressConfirmed || !c.address)
    throw new PostcardProofError(
      "Confirm the recipient mailing address before scheduling postcards.",
    );
  const proof = c.postcardProof;
  if (
    !proof?.approvedAt ||
    proof.hash !== expectedHash ||
    !postcardProofIsCurrent(c, proof, origin)
  )
    throw new PostcardProofError(
      "Review and approve the current print proof before releasing postcards.",
      409,
    );
  const readiness = postcardDeliveryReadiness(origin);
  if (!readiness.ready)
    throw new PostcardProofError(
      `Mailing remains on hold. ${readiness.reasons.join(" ")}`,
      503,
    );
  if (proof.releaseStatus === "released") return c;
  if (proof.firstMailingAt.slice(0, 10) < now.slice(0, 10))
    throw new PostcardProofError(
      "Choose a new first mailing date and approve the updated proof.",
      409,
    );
  if (
    c.deliveries.some(
      (delivery) =>
        delivery.providerId || (delivery.dispatch?.attempts || 0) > 0,
    )
  )
    throw new PostcardProofError(
      "A mailing is already in progress. The team needs to check its status first.",
      409,
    );
  c.postcardProof = { ...proof, releaseStatus: "released", releasedAt: now };
  c.deliveries = proof.cards.map((card) => ({
    chapterId: card.chapterId,
    scheduledFor: card.scheduledFor,
    status: "scheduled",
  }));
  return c;
}

/** Called after the storyteller's final approval and after address confirmation. No provider I/O. */
export async function prepareAutomaticPostcards(
  c: Collection,
  now = new Date().toISOString(),
  origin = appOrigin(),
) {
  if (c.status !== "approved") return c;
  if (
    c.autoPostcards !== true &&
    c.postcardProof?.releaseStatus !== "released" &&
    !c.deliveries.length
  )
    return c;
  const state = (
    status:
      "waiting_for_address" | "waiting_for_setup" | "ready" | "needs_attention",
    message: string,
  ) => {
    c.postcardPreparation = { status, message, updatedAt: now };
    return c;
  };
  if (!c.addressConfirmed || !c.address)
    return state(
      "waiting_for_address",
      "The stories are ready. Postcards will be prepared automatically after the mailing address is confirmed.",
    );
  if (
    c.postcardProof?.releaseStatus === "released" &&
    postcardProofIsCurrent(c, c.postcardProof, origin)
  )
    return state(
      "ready",
      "The approved postcards are on the automatic mailing schedule.",
    );
  if (
    c.deliveries.some(
      (delivery) =>
        delivery.providerId || (delivery.dispatch?.attempts || 0) > 0,
    )
  )
    return state(
      "needs_attention",
      "A mailing is already in progress. The team will check it before preparing another print version.",
    );
  try {
    // If setup held a previous schedule in the past, start a fresh quarterly schedule when ready.
    const first =
      c.postcardProof &&
      postcardProofIsCurrent(c, c.postcardProof, origin) &&
      c.postcardProof.firstMailingAt.slice(0, 10) >= now.slice(0, 10)
        ? c.postcardProof.firstMailingAt
        : now;
    const proof = await buildPostcardProof(c, first, origin);
    approvePostcardProof(c, proof, proof.hash, now);
    const readiness = postcardDeliveryReadiness(origin);
    if (!readiness.ready)
      return state(
        "waiting_for_setup",
        "The print version is saved. Mailing will begin automatically when delivery setup is ready.",
      );
    releasePostcardProof(c, proof.hash, now, origin);
    return state(
      "ready",
      "The approved postcards are on the automatic mailing schedule.",
    );
  } catch (error) {
    return state(
      "needs_attention",
      error instanceof PostcardProofError ||
        error instanceof PostcardLayoutError
        ? error.message
        : "The stories are approved. Postcard preparation needs a setup check from the team.",
    );
  }
}
