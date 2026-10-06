export type LivingStoryCategory =
  | "character"
  | "health"
  | "relationships"
  | "finances"
  | "happiness"
  | "meaning"
  | "faith";

export type LivingStoryBatch = {
  id: string;
  /** Scoped to its author and checked against the original selection on replay. */
  requestId: string;
  source: "family" | "owner";
  requestedByName: string;
  requestedByRecipientId?: string;
  promptIds: string[];
  createdAt: string;
  closedAt?: string;
};

export type LivingStoryMoment = {
  id: string;
  batchId: string;
  promptId: string;
  category: LivingStoryCategory;
  title: string;
  question: string;
  status: "draft" | "processing" | "published" | "needs_attention" | "declined";
  sourceMediaId?: string;
  videoMediaId?: string;
  content?: string;
  sourceQuote?: string;
  sourceSha256?: string;
  kind?: "voice" | "video";
  processingApprovedAt?: string;
  processingError?: string;
  processing?: {
    state: "queued" | "running";
    attempts: number;
    leaseId?: string;
    leaseExpiresAt?: string;
  };
  createdAt: string;
  publishedAt?: string;
};

export type LivingStory = {
  batches: LivingStoryBatch[];
  moments: LivingStoryMoment[];
};
