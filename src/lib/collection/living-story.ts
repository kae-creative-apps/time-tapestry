import { randomUUID } from "node:crypto";
import { FLOURISHING_PROMPTS } from "./flourishing-prompts";
import { getMedia, listCollections, mutateCollection } from "./store";
import { recipientById } from "./recipients";
import { isStoredOwnerRecording } from "./recording-validation";
import { validateReplyRecording } from "./reply-media";
import {
  queueLivingStoryPublished,
  queueLivingStoryRequest,
} from "./living-story-notifications";
import type { CollectionAccess } from "./request-access";
import type { Collection, StoredMedia } from "./types";
import type { LivingStoryMoment } from "./living-story-types";

const nowIso = () => new Date().toISOString();
const LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);

function approved(c: Collection) {
  if (c.status !== "approved")
    throw new Error(
      "Finish sharing your original gift before adding new stories.",
    );
}
function owner(access: CollectionAccess) {
  if (access.role !== "owner")
    throw new Error("Only the storyteller can save or share a new recording.");
}
function momentFor(c: Collection, id: unknown) {
  const moment = c.livingStory?.moments.find((item) => item.id === id);
  if (!moment) throw new Error("This story question could not be found.");
  return moment;
}

/** Upload scope is checked before allocating storage and again at finalization. */
export function assertLivingStoryUpload(c: Collection, momentId: string) {
  approved(c);
  const moment = momentFor(c, momentId);
  if (
    !["draft", "needs_attention"].includes(moment.status) ||
    c.livingStory?.batches.find((batch) => batch.id === moment.batchId)
      ?.closedAt
  )
    throw new Error("This question is no longer open for a recording.");
  return moment;
}

async function originalFor(
  c: Collection,
  moment: LivingStoryMoment,
  mediaId: unknown,
): Promise<StoredMedia> {
  if (!validId(mediaId))
    throw new Error("Save your audio or video recording before continuing.");
  const media = await getMedia(mediaId);
  if (
    !isStoredOwnerRecording(media, c) ||
    media.livingStoryMomentId !== moment.id ||
    media.provenance !== "uploaded_recording"
  )
    throw new Error(
      "Save an original recording for this question before continuing.",
    );
  return media;
}

function closeCompletedBatch(c: Collection, moment: LivingStoryMoment) {
  const story = c.livingStory!;
  if (
    story.moments
      .filter((item) => item.batchId === moment.batchId)
      .every(
        (item) => item.status === "published" || item.status === "declined",
      )
  ) {
    const batch = story.batches.find((item) => item.id === moment.batchId)!;
    batch.closedAt ??= nowIso();
  }
}

/** Caller holds the collection lock and has re-authenticated against that record. */
export async function applyLivingStoryAction(
  c: Collection,
  access: CollectionAccess,
  body: Record<string, unknown>,
) {
  approved(c);
  if (
    access.role === "requester" ||
    (access.role === "recipient" &&
      (!access.recipientId || !recipientById(c, access.recipientId)))
  )
    throw new Error(
      "Open your verified family account to request another story.",
    );
  const action = body.action;
  c.livingStory ??= { batches: [], moments: [] };
  const story = c.livingStory;
  if (action === "request" || action === "start") {
    if (action === "start") owner(access);
    else if (access.role !== "recipient")
      throw new Error(
        "Family story requests come from an invited family account.",
      );
    if (!validId(body.requestId))
      throw new Error(
        "This story request needs a valid save reference. Please try again.",
      );
    if (
      !Array.isArray(body.promptIds) ||
      body.promptIds.length < 1 ||
      body.promptIds.length > 3 ||
      new Set(body.promptIds).size !== body.promptIds.length ||
      body.promptIds.some((id) => typeof id !== "string")
    )
      throw new Error("Choose one to three different questions.");
    const prompts = body.promptIds.map((id) =>
      FLOURISHING_PROMPTS.find((prompt) => prompt.id === id),
    );
    if (prompts.some((prompt) => !prompt))
      throw new Error("Choose questions from the story library.");
    const source = action === "request" ? "family" : "owner";
    const recipientId = source === "family" ? access.recipientId : undefined;
    const existing = story.batches.find(
      (batch) =>
        batch.requestId === body.requestId &&
        batch.source === source &&
        batch.requestedByRecipientId === recipientId,
    );
    if (existing) {
      if (JSON.stringify(existing.promptIds) !== JSON.stringify(body.promptIds))
        throw new Error(
          "This save reference already belongs to a different question selection.",
        );
      return c;
    }
    if (
      source === "family" &&
      story.batches.some(
        (batch) => batch.source === "family" && !batch.closedAt,
      )
    )
      throw new Error(
        "Your family already has questions waiting. Let the storyteller finish those first.",
      );
    if (
      body.displayName !== undefined &&
      (typeof body.displayName !== "string" || body.displayName.length > 120)
    )
      throw new Error("Keep your display name under 120 characters.");
    const createdAt = nowIso();
    const batch = {
      id: randomUUID(),
      requestId: body.requestId,
      source,
      requestedByName:
        source === "family"
          ? (typeof body.displayName === "string" && body.displayName.trim()) ||
            recipientById(c, recipientId)?.name ||
            "Someone in your family"
          : c.storyteller.name,
      ...(recipientId ? { requestedByRecipientId: recipientId } : {}),
      promptIds: body.promptIds as string[],
      createdAt,
    } as const;
    story.batches.push(batch);
    for (const prompt of prompts)
      story.moments.push({
        id: randomUUID(),
        batchId: batch.id,
        promptId: prompt!.id,
        category: prompt!.category,
        title: prompt!.title,
        question: prompt!.question,
        status: "draft",
        createdAt,
      });
    if (source === "family") queueLivingStoryRequest(c, batch);
    return c;
  }
  owner(access);
  if (action === "close") {
    const batch = story.batches.find((item) => item.id === body.batchId);
    if (!batch) throw new Error("This group of questions could not be found.");
    if (batch.closedAt) return c;
    const moments = story.moments.filter((item) => item.batchId === batch.id);
    if (moments.some((item) => item.status === "processing"))
      throw new Error(
        "A story is being prepared. Wait for it to finish before closing these questions.",
      );
    for (const moment of moments)
      if (moment.status !== "published") moment.status = "declined";
    batch.closedAt = nowIso();
    return c;
  }
  const moment = momentFor(c, body.momentId);
  if (action === "attach") {
    if (body.expectedSourceMediaId !== undefined) {
      if (
        body.expectedSourceMediaId !== null &&
        !validId(body.expectedSourceMediaId)
      )
        throw new Error(
          "The saved recording reference could not be checked. Refresh this story and try again.",
        );
      // A repeated acknowledgement never changes a later processing state.
      if (moment.sourceMediaId === body.mediaId) return c;
      if ((moment.sourceMediaId ?? null) !== body.expectedSourceMediaId)
        throw new Error(
          "This question has a newer saved recording. Refresh before choosing a different recording. Your uploaded recording is preserved.",
        );
    }
    assertLivingStoryUpload(c, moment.id);
    const media = await originalFor(c, moment, body.mediaId);
    if (moment.sourceMediaId !== media.id) {
      moment.processing = undefined;
      moment.processingApprovedAt = undefined;
    }
    moment.sourceMediaId = media.id;
    moment.kind = media.mimeType.startsWith("video/") ? "video" : "voice";
    moment.processingError = undefined;
    moment.status = "draft";
  } else if (action === "publish" || action === "submit") {
    if (moment.status === "published" || moment.status === "processing")
      return c;
    assertLivingStoryUpload(c, moment.id);
    if (body.processingApproved !== true)
      throw new Error(
        "Confirm that we may prepare your film and written story from this recording.",
      );
    if ((moment.processing?.attempts ?? 0) >= MAX_ATTEMPTS)
      throw new Error(
        "This recording needs an operator check. Your original is saved, or you can make a new recording.",
      );
    const media = await originalFor(c, moment, moment.sourceMediaId);
    try {
      await validateReplyRecording(media);
    } catch {
      throw new Error(
        "This recording could not be read. Play it again or save a new recording before submitting.",
      );
    }
    moment.status = "processing";
    moment.processingApprovedAt = nowIso();
    moment.processingError = undefined;
    moment.processing = {
      state: "queued",
      attempts: moment.processing?.attempts ?? 0,
    };
  } else if (action === "decline") {
    if (moment.status === "declined") return c;
    assertLivingStoryUpload(c, moment.id);
    moment.status = "declined";
    closeCompletedBatch(c, moment);
  } else throw new Error("Choose a story action.");
  return c;
}

function assertLease(c: Collection, momentId: string, leaseId: string) {
  approved(c);
  const moment = momentFor(c, momentId);
  if (
    moment.status !== "processing" ||
    moment.processing?.state !== "running" ||
    moment.processing.leaseId !== leaseId ||
    Date.parse(moment.processing.leaseExpiresAt || "") <= Date.now() ||
    !Number.isFinite(Date.parse(moment.processing.leaseExpiresAt || ""))
  )
    throw new Error("This story preparation lease is no longer current.");
  return moment;
}

export async function claimNextLivingStoryMoment(): Promise<{
  collection: Collection;
  moment: LivingStoryMoment;
  leaseId: string;
} | null> {
  const candidates = (await listCollections()).filter(
    (c) =>
      c.status === "approved" &&
      c.livingStory?.moments.some((moment) => moment.status === "processing"),
  );
  for (const candidate of candidates) {
    let claimedId: string | undefined;
    let leaseId = "";
    const collection = await mutateCollection(candidate.id, (c) => {
      if (c.status !== "approved") return c;
      const moment = c.livingStory?.moments.find(
        (item) =>
          item.status === "processing" &&
          (item.processing?.state === "queued" ||
            Date.parse(item.processing?.leaseExpiresAt || "") <= Date.now()),
      );
      if (!moment) return c;
      if (
        !moment.processingApprovedAt ||
        !moment.sourceMediaId ||
        (moment.processing?.attempts ?? 0) >= MAX_ATTEMPTS
      ) {
        moment.status = "needs_attention";
        moment.processingError =
          "Story preparation needs an operator check. Your original recording is saved.";
        return c;
      }
      claimedId = moment.id;
      leaseId = randomUUID();
      moment.processing = {
        state: "running",
        attempts: (moment.processing?.attempts ?? 0) + 1,
        leaseId,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS).toISOString(),
      };
      return c;
    });
    if (claimedId)
      return {
        collection,
        moment: collection.livingStory!.moments.find(
          (item) => item.id === claimedId,
        )!,
        leaseId,
      };
  }
  return null;
}

export async function heartbeatLivingStoryMoment(
  collectionId: string,
  momentId: string,
  leaseId: string,
) {
  return mutateCollection(collectionId, (c) => {
    const moment = assertLease(c, momentId, leaseId);
    moment.processing!.leaseExpiresAt = new Date(
      Date.now() + LEASE_MS,
    ).toISOString();
    return c;
  });
}

export async function completeLivingStoryMoment(
  collectionId: string,
  momentId: string,
  leaseId: string,
  output: {
    videoMediaId: string;
    content: string;
    sourceMediaId: string;
    sourceSha256: string;
    sourceQuote?: string;
    sourceTranscript?: string;
  },
) {
  return mutateCollection(collectionId, async (c) => {
    const previous = momentFor(c, momentId);
    if (
      previous.status === "published" &&
      previous.videoMediaId === output.videoMediaId &&
      previous.sourceMediaId === output.sourceMediaId &&
      previous.sourceSha256 === output.sourceSha256 &&
      previous.content === output.content.trim()
    )
      return c;
    const moment = assertLease(c, momentId, leaseId);
    if (
      output.sourceQuote !== undefined &&
      (typeof output.sourceQuote !== "string" ||
        !output.sourceQuote.trim() ||
        output.sourceQuote.trim().length > 300 ||
        typeof output.sourceTranscript !== "string" ||
        !output.sourceTranscript.includes(output.sourceQuote.trim()))
    )
      throw new Error(
        "The story quote must come directly from its source transcript.",
      );
    if (
      moment.sourceMediaId !== output.sourceMediaId ||
      !/^[a-f0-9]{64}$/i.test(output.sourceSha256) ||
      typeof output.content !== "string" ||
      !output.content.trim() ||
      output.content.length > 50000
    )
      throw new Error("The prepared story does not match its saved original.");
    await originalFor(c, moment, output.sourceMediaId);
    const media =
      validId(output.videoMediaId) && (await getMedia(output.videoMediaId));
    if (
      !media ||
      media.collectionId !== c.id ||
      media.role !== "owner" ||
      media.provenance !== "generated_film" ||
      media.originalSourceMediaId !== output.sourceMediaId ||
      media.livingStoryMomentId !== moment.id ||
      media.mimeType !== "video/mp4" ||
      !Number.isSafeInteger(media.bytes) ||
      media.bytes <= 0 ||
      ![media.url, media.localPath].some(
        (location) => typeof location === "string" && location.trim(),
      )
    )
      throw new Error("The prepared film has not been saved for this story.");
    moment.videoMediaId = media.id;
    moment.content = output.content.trim();
    moment.sourceQuote = output.sourceQuote?.trim();
    moment.sourceSha256 = output.sourceSha256;
    moment.status = "published";
    moment.publishedAt = nowIso();
    moment.processingError = undefined;
    moment.processing = undefined;
    closeCompletedBatch(c, moment);
    queueLivingStoryPublished(c, moment);
    return c;
  });
}

export async function failLivingStoryMoment(
  collectionId: string,
  momentId: string,
  leaseId: string,
  error: string,
) {
  return mutateCollection(collectionId, (c) => {
    const moment = assertLease(c, momentId, leaseId);
    moment.status = "needs_attention";
    moment.processingError = error.slice(0, 1000);
    moment.processing = {
      state: "queued",
      attempts: moment.processing!.attempts,
    };
    return c;
  });
}
