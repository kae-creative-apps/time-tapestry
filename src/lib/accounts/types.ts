export type Account = {
  recordType: "verified-account";
  id: string;
  email: string;
  createdAt: string;
  verifiedAt: string;
};
export type EmailVerification = {
  recordType: "account-email-verification";
  email: string;
  nonceHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  cancelledAt?: string;
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
  openUrl: string;
};
