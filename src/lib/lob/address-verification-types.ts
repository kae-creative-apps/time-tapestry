import type { PostalAddress } from "../collection/types";

export type AddressDeliverability =
  | "deliverable"
  | "deliverable_unnecessary_unit"
  | "deliverable_incorrect_unit"
  | "deliverable_missing_unit"
  | "undeliverable";

export type AddressVerificationReceipt = {
  id: string;
  addressHash: string;
  providerId: string;
  verifiedAt: string;
  mode: "test" | "live";
  deliverability: "deliverable" | "deliverable_unnecessary_unit";
};

export type AddressVerificationResult = {
  deliverability: AddressDeliverability;
  deliverable: boolean;
  mode: "test" | "live";
  address?: PostalAddress;
  verificationId?: string;
  message: string;
};
