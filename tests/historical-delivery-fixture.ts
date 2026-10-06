import { fixtureAddressReceipt } from "./address-verification-fixture";
import { postcardScheduledDate } from "../src/lib/collection/postcard-cadence";
import type { Collection } from "../src/lib/collection/types";

/** An already approved pre-recording-policy collection, for delivery compatibility tests. */
export function historicalApprovedCollection(
  collection: Collection,
  approvedAt: string,
  options: { deliveryMode?: "digital" | "postal" } = {},
): Collection {
  return {
    ...collection,
    ...(collection.address
      ? { addressVerification: fixtureAddressReceipt(collection) }
      : {}),
    status: "approved",
    approvedAt,
    approvedVersion: 1,
    deliveries:
      options.deliveryMode === "digital"
        ? []
        : collection.chapters.map((chapter, index) => ({
            chapterId: chapter.id,
            scheduledFor: postcardScheduledDate(collection, approvedAt, index),
            status: "scheduled",
          })),
  };
}
