import { timingSafeEqual } from "node:crypto";
import { chapterMoments, chapterTranscript } from "./chapter-highlights";
import { livingStoryView } from "./living-story-view";
import type { Collection, CollectionView } from "./types";
import {
  PRIMARY_RECIPIENT_ID,
  recipientById,
  storedRecipientId,
} from "./recipients";
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
    collection: `/collection/${c.id}`,
    address: `/collection/${c.id}/address`,
  };
}
export function publicView(
  c: Collection,
  role: CollectionView["role"],
  recipientId = PRIMARY_RECIPIENT_ID,
): CollectionView {
  const {
    ownerKey,
    recipientKey,
    requesterKey,
    creationRequestHash,
    privateGenerosityNotes,
    pendingAddressVerification,
    addressVerification,
    ...view
  } = structuredClone(c);
  void creationRequestHash;
  void pendingAddressVerification;
  void addressVerification;
  void ownerKey;
  void recipientKey;
  void requesterKey;
  view.deliveries = view.deliveries.map(
    ({ dispatch, ...delivery }) => delivery,
  );
  view.notifications = view.notifications.map(
    ({ dispatch, ...notification }) => notification,
  );
  view.replies = view.replies.map((reply) => {
    const author = recipientById(c, storedRecipientId(reply), true);
    return {
      ...reply,
      recipientId: storedRecipientId(reply),
      authorName: author?.name || "",
      authorEmail: author?.email || "",
    };
  });
  view.livingStory = livingStoryView(c, role);
  if (role !== "owner") {
    view.storyIssues = undefined;
    view.interviewPreparation = undefined;
    view.additionalRecipients = undefined;
    view.postcardPublicConsent = undefined;
    view.postcardPreparation = undefined;
    view.postcardProof = undefined;
    view.postcardProofHistory = undefined;
    view.interviews = undefined;
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
    view.chapters = view.chapters.map((chapter) => ({
      ...chapter,
      sourceTakeIds: [],
      playback:
        chapter.playback &&
        chapter.editorialReviewed &&
        chapter.reviewedPlaybackSha256 === chapter.playback.outputSha256
          ? {
              ...chapter.playback,
              sourceTakeIds: [],
              sourceSha256: "",
              planSha256: "",
            }
          : undefined,
      film: chapter.film
        ? {
            ...chapter.film,
            sourceTakeIds: [],
            ...(chapter.film.narrationKind === "original_recording"
              ? { sourceRanges: [], sourceAssets: [] }
              : {}),
          }
        : undefined,
    }));
    view.explicitTakeSelections = undefined;
    view.invitationNote = "";
    view.draftHistory = undefined;
    if (role === "requester") {
      view.chapterBlessings = {};
      view.replies = [];
      view.recipientViewedChapters = {};
    }
    view.storyteller = { name: c.storyteller.name, email: "" };
    view.requester = { name: c.requester.name, email: "" };
    if (role === "recipient") {
      const recipient = recipientById(c, recipientId);
      view.replies = recipient
        ? view.replies.filter(
            (reply) => storedRecipientId(reply) === recipientId,
          )
        : [];
      view.recipient = {
        name: recipient?.name || "",
        email: recipient?.email || "",
      };
      if (!recipient?.primary) {
        const member = c.additionalRecipients?.find(
          (item) => item.id === recipientId,
        );
        view.address = undefined;
        view.addressConfirmed = false;
        view.deliveries = [];
        view.requester = { name: "", email: "" };
        view.recipientViewedChapters = { ...member?.viewedChapters };
        view.replyRemindersEnabled = member?.replyRemindersEnabled ?? false;
        view.postcardPublicMessages = undefined;
      }
    }
    if (role === "requester" && c.requester.email !== c.recipient.email) {
      view.address = undefined;
      view.recipient = { name: c.recipient.name, email: "" };
      view.replies = [];
    }
  }
  view.chapters = view.chapters.map((chapter) => {
    const source =
      c.chapters.find((item) => item.id === chapter.id) || chapter;
    return {
      ...chapter,
      storyMoments: chapterMoments({
        content: source.content,
        postcardNote: source.postcardNote,
        generatedWith: source.generatedWith,
        film: source.film,
        playbackWords: source.playback?.words,
      }),
      storyTranscript: chapterTranscript(source.content),
    };
  });
  return {
    ...view,
    ...(role === "owner" && privateGenerosityNotes
      ? { privateGenerosityNotes }
      : {}),
    role,
    ...(role === "recipient"
      ? {
          recipientId,
          isPrimaryRecipient: recipientId === PRIMARY_RECIPIENT_ID,
        }
      : {}),
    links: role === "owner" ? linksFor(c) : undefined,
    capabilities: {
      tts: Boolean(
        process.env.ELEVENLABS_API_KEY?.trim() &&
        process.env.ELEVENLABS_AGENT_ID?.trim(),
      ),
      transcription: Boolean(process.env.OPENAI_API_KEY),
      ai: Boolean(process.env.GLOO_API_KEY),
      mail: Boolean(process.env.LOB_API_KEY && process.env.LOB_FROM_ADDRESS_ID),
      email: Boolean(process.env.RESEND_API_KEY),
      media: !process.env.VERCEL || Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      directUpload: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      liveInterview: Boolean(
        process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID,
      ),
    },
  };
}
export function requireOwner(c: Collection, role: string | null) {
  if (role !== "owner")
    throw new Error("Open your interview link to make changes.");
  if (c.status === "approved")
    throw new Error("These approved stories cannot be edited.");
}
