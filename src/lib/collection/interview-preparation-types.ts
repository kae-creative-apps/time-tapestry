import type { ChapterPackage, InterviewSession, StoredMedia } from "./types";

export type InterviewPreparationStatus =
  "queued" | "preparing" | "films_queued" | "needs_attention";

export type InterviewPreparationView = {
  id: string;
  status: InterviewPreparationStatus;
  submittedAt: string;
  updatedAt: string;
  processingApprovedAt: string;
  filmJobId?: string;
  missingAreas?: Array<{ id: string; title: string }>;
  error?: string;
  /** Derived from all four current original-film attachments, never worker availability. */
  ready?: boolean;
  canRetry?: boolean;
  retryAfter?: string;
};

export type InterviewPreparationJob = {
  schemaVersion: 1;
  recordType: "interview-preparation-job";
  id: string;
  collectionId: string;
  status: InterviewPreparationStatus;
  sourceSha256: string;
  recordingSha256: string;
  originalInputs: unknown;
  originalMedia: StoredMedia[];
  submittedAt: string;
  updatedAt: string;
  processingApprovedAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lease?: { token: string; expiresAt: number };
  reconciledSourceSha256?: string;
  /** Current source before recovery, retained while cached recovery is committed. */
  recoveryInputSha256?: string;
  recoveredInterviews?: InterviewSession[];
  /** Selected takes after a verified scoped conversational replacement is committed. */
  recoveredSelectedTakeIds?: Record<string, string>;
  drafts?: ChapterPackage[];
  filmJobId?: string;
  missingAreas?: InterviewPreparationView["missingAreas"];
  error?: string;
};
