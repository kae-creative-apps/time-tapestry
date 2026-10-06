import { randomUUID } from "node:crypto";
import { postalAddressHash } from "../src/lib/lob/address-verification";
import type { Collection, PostalAddress } from "../src/lib/collection/types";
import type { AddressVerificationReceipt } from "../src/lib/lob/address-verification-types";

/** Server-side fixture only. Never contacts Lob or represents a real verification. */
export function fixtureAddressReceipt(
  c: Collection,
  address = c.address!,
): AddressVerificationReceipt {
  if (!address) throw new Error("Fixture needs an address");
  return {
    id: randomUUID(),
    providerId: "us_ver_fixture",
    mode: "live",
    deliverability: "deliverable",
    verifiedAt: new Date().toISOString(),
    addressHash: postalAddressHash(c.id, address),
  };
}
export function fixtureVerifiedAddress(c: Collection, address?: PostalAddress) {
  if (address) c.address = address;
  c.addressVerification = fixtureAddressReceipt(c);
  return c;
}
