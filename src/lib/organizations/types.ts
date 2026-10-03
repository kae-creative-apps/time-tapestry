import type { Collection } from "../collection/types";

export type OrganizationType = "church" | "nonprofit" | "other";
export type GiftStatus = "issued" | "redeeming" | "redeemed" | "revoked";

export type OrganizationGift = {
  id: string;
  name: string;
  email: string;
  key: string;
  status: GiftStatus;
  createdAt: string;
  redeemedAt?: string;
  revokedAt?: string;
  claim?: {
    tokenHash: string;
    collectionId: string;
    // Removed after the collection is saved. Enables recovery after a failed write.
    preparedCollection?: Collection;
  };
};

export type OrganizationRecord = {
  recordType: "organization-gifting";
  schemaVersion: 1;
  id: string;
  organizationName: string;
  organizationType: OrganizationType;
  contactName: string;
  contactEmail: string;
  quantity: number;
  managementKey: string;
  createdAt: string;
  updatedAt: string;
  gifts: OrganizationGift[];
};

export type OrganizationView = {
  id: string;
  organizationName: string;
  organizationType: OrganizationType;
  contactName: string;
  contactEmail: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  seats: { total: number; available: number; issued: number; redeemed: number };
  gifts: Array<{
    id: string;
    name: string;
    email: string;
    status: GiftStatus;
    createdAt: string;
    giftUrl?: string;
  }>;
};

export type GiftView = {
  organizationName: string;
  name: string;
  email: string;
  status: GiftStatus;
};
