import type { PostcardProofSnapshot } from "./postcard-proofs";
import type { CollectionUsage } from "./usage";
import type { StoryFilmArtifact } from "./films/types";
import type { PrivateGenerosityNotes } from "./generosity-notes";
export type Contact = { name: string; email: string; phone?: string };
export type AdditionalRecipient = {
  id: string;
  email: string;
  name?: string;
  invitedAt: string;
  invitationVersion?: number;
  revokedAt?: string;
  viewedChapters?: Record<string, string>;
  replyRemindersEnabled?: boolean;
};
export type PostalAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
export type AnswerTake = {
  /** A recorded replacement excludes the older chapter answers once, on creation. */
  replacesChapterId?: InterviewChapterId;
  id: string;
  questionId: string;
  prompt: string;
  kind: "text" | "voice" | "video";
  text: string;
  mediaId?: string;
  durationSeconds?: number;
  createdAt: string;
  audioMediaId?: string;
  transcriptionStatus?: "pending" | "ready" | "failed";
  liveSource?: {
    sessionId: string;
    turnId: string;
    chapterId: InterviewChapterId;
    timing: "estimated" | "unaligned";
    sourceRanges: Array<{
      segmentId: string;
      mediaId: string;
      inMs?: number;
      outMs?: number;
    }>;
  };
};
export type InterviewChapterId = "q1" | "q2" | "q3" | "q4";
export type InterviewStatus = "active" | "paused" | "completed" | "interrupted";
export type InterviewTurn = {
  id: string;
  sequence: number;
  role: "agent" | "user";
  text: string;
  capturedAt: string;
  chapterId?: InterviewChapterId;
  startMs?: number;
  endMs?: number;
  timing: "estimated" | "unaligned";
  supersedesTurnId?: string;
};
export type InterviewSegment = {
  id: string;
  localTakeId?: string;
  mediaId: string;
  audioMediaId?: string;
  startMs: number;
  durationMs: number;
  kind: "voice" | "video";
  createdAt: string;
};
export type InterviewSession = {
  id: string;
  provider: "elevenlabs" | "guided";
  providerConversationId?: string;
  providerConversationIds?: string[];
  status: InterviewStatus;
  startedAt: string;
  endedAt?: string;
  turns: InterviewTurn[];
  segments: InterviewSegment[];
  excludedTurnIds: string[];
};
export type ChapterPackage = {
  id: string;
  title: string;
  content: string;
  postcardNote: string;
  sourceTakeIds: string[];
  videoMediaId?: string;
  videoStatus: "not_requested" | "awaiting_edit" | "ready";
  film?: StoryFilmArtifact;
  reviewedFilmSha256?: string;
  captions?: string;
  editorialReviewed: boolean;
  generatedWith: "source_text" | "gloo";
};
export type DispatchState = {
  attempts?: number;
  firstAttemptAt?: string;
  nextAttemptAt?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  idempotencyKey?: string;
  requestBody?: string;
  reconciliationRequired?: boolean;
};
export type Delivery = {
  chapterId: string;
  scheduledFor: string;
  status: "scheduled" | "submitted" | "mailed" | "failed" | "returned";
  providerId?: string;
  mailedAt?: string;
  mailEvent?: string;
  error?: string;
  dispatch?: DispatchState;
};
export type Reply = {
  /** Untagged historical replies belong to the primary postcard recipient. */
  recipientId?: string;
  /** Display-only attribution resolved from trusted membership by publicView. */
  authorName?: string;
  authorEmail?: string;
  id: string;
  chapterId: string;
  text: string;
  mediaId?: string;
  createdAt: string;
};
export type Notification = {
  /** Trusted recipient membership for recipient-specific delivery. */
  recipientId?: string;
  id: string;
  kind:
    | "invitation"
    | "review_ready"
    | "collection_ready"
    | "recipient_invitation"
    | "postcard_mailed"
    | "postcard_followup"
    | "reply_invitation"
    | "reply_received"
    | "address_request";
  to: string;
  subject: string;
  text: string;
  url: string;
  dueAt: string;
  status: "pending" | "sent" | "failed" | "suppressed";
  sentAt?: string;
  error?: string;
  chapterId?: string;
  providerId?: string;
  dispatch?: DispatchState;
};
export type PostcardCadence = "biweekly" | "quarterly";
export type Collection = {
  /** Digital access only. The primary recipient still owns all physical postcards. */
  additionalRecipients?: AdditionalRecipient[];
  /** Fixed when the collection is created. Missing on legacy quarterly collections. */
  postcardCadence?: PostcardCadence;
  /** Owner-only notebook. Never a source for interviews, stories, films or postcards. */
  privateGenerosityNotes?: PrivateGenerosityNotes;
  /** Internal binding for safe creation retries. Never returned to clients. */
  creationRequestHash?: string;
  /** Explicit consent to the four-card automatic mailing journey. */
  autoPostcards?: boolean;
  /** Public print copy, separate from private interview stories and blessings. */
  postcardPublicMessages?: Partial<Record<string, string>>;
  postcardPublicConsent?: {
    version: 2;
    messagesHash: string;
    approvedAt: string;
  };
  schemaVersion: 2;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "invited" | "recording" | "draft" | "approved";
  ownerKey: string;
  recipientKey: string;
  requesterKey: string;
  initiationPath: "share" | "request";
  storyteller: Contact;
  recipient: Contact;
  requester: Contact;
  address?: PostalAddress;
  addressConfirmed: boolean;
  invitationNote: string;
  faithFraming: "faith" | "beliefs";
  currentQuestion: number;
  chapterBlessings: Record<
    string,
    {
      encouragement: string;
      scriptureReference: string;
      scriptureText: string;
      scriptureTranslation: string;
    }
  >;
  takes: AnswerTake[];
  interviews?: InterviewSession[];
  selectedTakeIds: Record<string, string>;
  followUps: Record<string, string[]>;
  explicitTakeSelections?: Record<string, boolean>;
  draftHistory?: Array<{
    savedAt: string;
    chapters: ChapterPackage[];
    chapterBlessings: Collection["chapterBlessings"];
  }>;
  chapters: ChapterPackage[];
  draftOutdated?: boolean;
  approvedAt?: string;
  approvedVersion?: number;
  postcardPreparation?: {
    status:
      "waiting_for_address" | "waiting_for_setup" | "ready" | "needs_attention";
    message: string;
    updatedAt: string;
  };
  postcardProof?: PostcardProofSnapshot;
  postcardProofHistory?: PostcardProofSnapshot[];
  deliveries: Delivery[];
  replies: Reply[];
  notifications: Notification[];
  recipientViewedChapters: Record<string, string>;
  replyRemindersEnabled: boolean;
  processedMailEventIds?: string[];
};
export type CollectionView = Omit<
  Collection,
  "ownerKey" | "recipientKey" | "requesterKey"
> & {
  recipientId?: string;
  isPrimaryRecipient?: boolean;
  role: "owner" | "recipient" | "requester";
  usage?: CollectionUsage;
  links?: {
    interview: string;
    review: string;
    collection: string;
    address: string;
  };
  capabilities: {
    tts: boolean;
    transcription: boolean;
    ai: boolean;
    mail: boolean;
    email: boolean;
    media: boolean;
    directUpload: boolean;
    liveInterview: boolean;
  };
};
export type StoredMedia = {
  /** Untagged historical recipient uploads belong to the primary recipient. */
  recipientId?: string;
  /** Provider output written only by the authenticated server transcription route. */
  transcription?: {
    text: string;
    provider: "openai";
    model: "whisper-1";
    completedAt: string;
  };
  /** Assigned by server upload/render paths. Omitted on older saved media. */
  provenance?: "uploaded_recording" | "generated_film";
  id: string;
  collectionId: string;
  role: "owner" | "recipient";
  mimeType: string;
  originalName: string;
  bytes: number;
  createdAt: string;
  url?: string;
  localPath?: string;
};
