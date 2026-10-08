import type { Collection, Contact } from "../collection/types";
import type { OrganizationChapterProgress } from "./progress";

export type OrganizationType =
  "church" | "nonprofit" | "retirement_community" | "family" | "other";
export type GiftStatus = "issued" | "redeeming" | "redeemed" | "revoked";

export type InvitationDelivery = {
  status: "sent" | "failed";
  at: string;
  error?: string;
};

export type OrganizationGift = {
  id: string;
  name: string;
  email: string;
  /** Legacy invitations retain their existing capability. New invitations keep only a digest. */
  key?: string;
  keyHash?: string;
  designatedRecipient?: Contact;
  status: GiftStatus;
  createdAt: string;
  redeemedAt?: string;
  revokedAt?: string;
  /** Server-only capability so an explicit resend can mail the same link. Never return it. */
  invitationSecret?: string;
  invitationDelivery?: InvitationDelivery;
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
    designatedRecipient?: Contact;
    invitationDelivery?: InvitationDelivery;
    progress: OrganizationChapterProgress[];
  }>;
};

export type GiftView = {
  organizationName: string;
  name: string;
  email: string;
  status: GiftStatus;
  designatedRecipient?: Contact;
};
