export type Account = {
  recordType: "verified-account";
  id: string;
  email: string;
  createdAt: string;
  verifiedAt: string;
};
export type RecipientLocator = {
  collectionId: string;
} & (
  | { chapterId?: "q1" | "q2" | "q3" | "q4"; view?: never }
  | { view: "address"; chapterId?: never }
);
export type EmailVerification = {
  recordType: "account-email-verification";
  email: string;
  nonceHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  cancelledAt?: string;
  recipientLocator?: RecipientLocator;
};
export type AccountSession = {
  recordType: "account-session";
  accountId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};
export type AccountRole = "owner" | "recipient" | "requester";
export type LibraryItem = {
  id: string;
  role: AccountRole;
  status: string;
  storytellerName: string;
  recipientName: string;
  updatedAt: string;
  storyCount: number;
  recordingCount: number;
  postcards: { scheduled: number; mailed: number; needsAttention: number };
  interviewState?: "recording" | "preparing" | "review" | "approved";
  openUrl: string;
};
