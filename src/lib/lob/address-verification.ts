import { createHash, randomUUID } from "node:crypto";
import type { Collection, PostalAddress } from "../collection/types";
import type {
  AddressDeliverability,
  AddressVerificationReceipt,
  AddressVerificationResult,
} from "./address-verification-types";

export class AddressVerificationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length <= maximum
    ? value.trim().replace(/\s+/g, " ")
    : "";

export function normalizePostalAddress(
  value: unknown,
  recipientName: string,
): PostalAddress {
  const input = object(value);
  const address: PostalAddress = {
    name: text(recipientName, 200),
    line1: text(input.line1, 200),
    line2: text(input.line2, 200),
    city: text(input.city, 100),
    region: text(input.region, 100),
    postalCode: text(input.postalCode, 30),
    country: text(input.country, 2).toUpperCase() || "US",
  };
  if (
    !address.name ||
    !address.line1 ||
    !address.city ||
    !address.region ||
    !/^\d{5}(?:-\d{4})?$/.test(address.postalCode) ||
    address.country !== "US"
  )
    throw new AddressVerificationError(
      "Add a complete US address with a five-digit ZIP code before checking it.",
    );
  return address;
}

/** Bind a verdict to one collection and the exact standardized mailing address. */
export function postalAddressHash(
  collectionId: string,
  address: PostalAddress,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        collectionId,
        ...[
          address.name,
          address.line1,
          address.line2 || "",
          address.city,
          address.region,
          address.postalCode,
          address.country,
        ].map((part) => part.trim().replace(/\s+/g, " ").toUpperCase()),
      ]),
    )
    .digest("hex");
}

type AddressState = Pick<Collection, "id" | "address"> & {
  addressVerification?: AddressVerificationReceipt;
  pendingAddressVerification?: AddressVerificationReceipt;
};
export function addressVerificationIsCurrent(
  c: AddressState,
  requireLive = false,
) {
  const receipt = c.addressVerification;
  return Boolean(
    c.address &&
    receipt &&
    ["deliverable", "deliverable_unnecessary_unit"].includes(
      receipt.deliverability,
    ) &&
    (!requireLive || receipt.mode === "live") &&
    receipt.addressHash === postalAddressHash(c.id, c.address),
  );
}

/** Client booleans never count as verification. Only a recent server receipt can be accepted. */
export function assertAddressVerification(
  c: AddressState,
  address: PostalAddress,
  receiptId: unknown,
): AddressVerificationReceipt {
  const receipt = [c.pendingAddressVerification, c.addressVerification].find(
    (candidate) => candidate && candidate.id === receiptId,
  );
  const age = receipt ? Date.now() - Date.parse(receipt.verifiedAt) : NaN;
  if (
    !receipt ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 30 * 60 * 1000 ||
    !["deliverable", "deliverable_unnecessary_unit"].includes(
      receipt.deliverability,
    ) ||
    receipt.addressHash !== postalAddressHash(c.id, address)
  )
    throw new AddressVerificationError(
      "Check this address and accept the suggested mailing address before saving it.",
      409,
    );
  return receipt;
}

const verdicts: readonly AddressDeliverability[] = [
  "deliverable",
  "deliverable_unnecessary_unit",
  "deliverable_incorrect_unit",
  "deliverable_missing_unit",
  "undeliverable",
];
const messages: Record<AddressDeliverability, string> = {
  deliverable:
    "This address is recognized for US postal delivery. Review the suggested address below.",
  deliverable_unnecessary_unit:
    "The postal service does not need the unit information for this address. Review the suggested address below.",
  deliverable_incorrect_unit:
    "The building was found, but the apartment or suite could not be confirmed. Check the unit number and try again.",
  deliverable_missing_unit:
    "Add an apartment, suite, or unit number so this postcard can reach the right person.",
  undeliverable:
    "This address could not be confirmed for delivery. Check the street, city, state, and ZIP code, then try again.",
};

/** POST /v1/us_verifications, per https://docs.lob.com/#tag/US-Verifications. */
export async function verifyPostalAddress(
  collectionId: string,
  address: PostalAddress,
  beforeRequest?: () => Promise<void>,
): Promise<{
  result: AddressVerificationResult;
  receipt?: AddressVerificationReceipt;
}> {
  const apiKey = process.env.LOB_API_KEY?.trim() || "";
  const mode = apiKey.startsWith("live_")
    ? "live"
    : apiKey.startsWith("test_")
      ? "test"
      : null;
  if (!mode)
    throw new AddressVerificationError(
      "Address checking is not connected yet. Your address can stay on this page while we finish setup.",
      503,
    );
  await beforeRequest?.();
  let response: Response;
  try {
    response = await fetch(
      "https://api.lob.com/v1/us_verifications?case=proper",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primary_line: address.line1,
          secondary_line: address.line2 || "",
          city: address.city,
          state: address.region,
          zip_code: address.postalCode,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new AddressVerificationError(
      "Address checking did not respond. Your changes are still here. Please try again.",
      503,
    );
  }
  if (!response.ok)
    throw new AddressVerificationError(
      response.status === 422
        ? "The address could not be checked. Review each field and try again."
        : "Address checking is temporarily unavailable. Please try again.",
      response.status === 422 ? 422 : 503,
    );
  const raw: unknown = await response.json().catch(() => null);
  const body = object(raw);
  const verdict = verdicts.find((item) => item === body.deliverability);
  const providerId = text(body.id, 100);
  if (!verdict || !/^us_ver_[A-Za-z0-9]+$/.test(providerId))
    throw new AddressVerificationError(
      "The address service returned an incomplete result. Please try again.",
      503,
    );
  const deliverable =
    verdict === "deliverable" || verdict === "deliverable_unnecessary_unit";
  const result: AddressVerificationResult = {
    deliverability: verdict,
    deliverable,
    mode,
    message:
      mode === "test"
        ? `Test result only. No real address has been verified. ${messages[verdict]}`
        : messages[verdict],
  };
  if (!deliverable) return { result };
  const components = object(body.components);
  let standardized: PostalAddress;
  try {
    standardized = normalizePostalAddress(
      {
        line1: body.primary_line,
        line2: body.secondary_line,
        city: components.city,
        region: components.state,
        postalCode: `${text(components.zip_code, 5)}${text(components.zip_code_plus_4, 4) ? `-${text(components.zip_code_plus_4, 4)}` : ""}`,
        country: "US",
      },
      address.name,
    );
  } catch {
    throw new AddressVerificationError(
      "The address service returned an incomplete address. Please try again.",
      503,
    );
  }
  const receipt: AddressVerificationReceipt = {
    id: randomUUID(),
    addressHash: postalAddressHash(collectionId, standardized),
    providerId,
    verifiedAt: new Date().toISOString(),
    mode,
    deliverability: verdict,
  };
  return {
    result: { ...result, address: standardized, verificationId: receipt.id },
    receipt,
  };
}
