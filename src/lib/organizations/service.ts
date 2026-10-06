import { createHash, randomBytes, randomUUID } from "node:crypto";
import { secretMatches } from "../collection/access";
import {
  CollectionInputError,
  collectionNextUrl,
  prepareCollection,
} from "../collection/create";
import { getCollection, mutateRecord, readRecord } from "../collection/store";
import type { Collection } from "../collection/types";
import type {
  GiftView,
  OrganizationGift,
  OrganizationRecord,
  OrganizationType,
  OrganizationView,
} from "./types";
import { organizationChapterProgress } from "./progress";
import { organizationJoinUrl } from "./join-token";

export class OrganizationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const secret = () => randomBytes(32).toString("hex");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const inputObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const clean = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function keyFor(id: string) {
  if (!uuid.test(id))
    throw new OrganizationError("This private link is not valid.", 404);
  return `org-${id}`;
}
function contact(nameValue: unknown, emailValue: unknown) {
  const name = clean(nameValue);
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  if (!name || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
    throw new OrganizationError(
      "Please provide a name and a valid email address.",
      400,
    );
  return { name, email };
}
function requireRecord(value: OrganizationRecord | null): OrganizationRecord {
  if (!value || value.recordType !== "organization-gifting")
    throw new OrganizationError("This private link is not valid.", 404);
  return value;
}
function requireManager(value: OrganizationRecord | null, key: string) {
  const organization = requireRecord(value);
  if (!secretMatches(organization.managementKey, key))
    throw new OrganizationError("This private link is not valid.", 404);
  return organization;
}
function requireGift(
  organization: OrganizationRecord,
  giftId: string,
  key?: string,
) {
  const gift = organization.gifts.find((item) => item.id === giftId);
  if (
    !gift ||
    (key !== undefined &&
      !(gift.keyHash
        ? secretMatches(gift.keyHash, hash(key))
        : secretMatches(gift.key || "", key)))
  )
    throw new OrganizationError("This gift link is not valid.", 404);
  return gift;
}
function seatCounts(organization: OrganizationRecord) {
  const redeemed = organization.gifts.filter(
    (g) => g.status === "redeemed",
  ).length;
  const issued = organization.gifts.filter(
    (g) => g.status === "issued" || g.status === "redeeming",
  ).length;
  return {
    total: organization.quantity,
    available: organization.quantity - issued - redeemed,
    issued,
    redeemed,
  };
}

/** Explicit allowlist: sponsors cannot receive story content or collection access keys. */
export function organizationView(
  organization: OrganizationRecord,
): OrganizationView {
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    organizationType: organization.organizationType,
    contactName: organization.contactName,
    contactEmail: organization.contactEmail,
    quantity: organization.quantity,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
    seats: seatCounts(organization),
    gifts: organization.gifts.map((gift) => ({
      id: gift.id,
      name: gift.name,
      email: gift.email,
      status: gift.status,
      createdAt: gift.createdAt,
      ...(gift.designatedRecipient
        ? {
            designatedRecipient: {
              name: gift.designatedRecipient.name,
              email: gift.designatedRecipient.email,
            },
          }
        : {}),
      progress: organizationChapterProgress(null),
    })),
  };
}

export async function createOrganization(value: unknown) {
  const b = inputObject(value);
  const organizationName = clean(b.organizationName);
  if (!organizationName)
    throw new OrganizationError(
      "Please add your church or organization name.",
      400,
    );
  if (
    ![
      "church",
      "nonprofit",
      "retirement_community",
      "family",
      "other",
    ].includes(String(b.organizationType))
  )
    throw new OrganizationError("Please choose an organization type.", 400);
  if (
    typeof b.quantity !== "number" ||
    !Number.isInteger(b.quantity) ||
    b.quantity < 1 ||
    b.quantity > 100
  )
    throw new OrganizationError("Choose between 1 and 100 family gifts.", 400);
  const purchaser = contact(b.contactName, b.contactEmail);
  const now = new Date().toISOString();
  const organization: OrganizationRecord = {
    recordType: "organization-gifting",
    schemaVersion: 1,
    id: randomUUID(),
    organizationName,
    organizationType: b.organizationType as OrganizationType,
    contactName: purchaser.name,
    contactEmail: purchaser.email,
    quantity: b.quantity,
    managementKey: secret(),
    createdAt: now,
    updatedAt: now,
    gifts: [],
  };
  await mutateRecord<OrganizationRecord>(
    keyFor(organization.id),
    (existing) => {
      if (existing)
        throw new OrganizationError(
          "Please try creating your group again.",
          409,
        );
      return organization;
    },
  );
  return {
    organization: organizationView(organization),
    nextUrl: `/organizations/${organization.id}?key=${organization.managementKey}`,
  };
}

export async function getOrganizationForManager(id: string, key: string) {
  const organization = requireManager(
    await readRecord<OrganizationRecord>(keyFor(id)),
    key,
  );
  const view = organizationView(organization);
  // At most 100 active gifts. Read only known collection IDs, never scan stories.
  for (let offset = 0; offset < organization.gifts.length; offset += 10) {
    await Promise.all(
      organization.gifts.slice(offset, offset + 10).map(async (gift, index) => {
        if (!gift.claim?.collectionId || gift.status !== "redeemed") return;
        const collection = await getCollection(gift.claim.collectionId);
        // Old redeemed gifts predate the reverse association; their private claim is authoritative.
        if (
          collection?.sponsorship &&
          (collection.sponsorship.organizationId !== id ||
            collection.sponsorship.giftId !== gift.id)
        )
          return;
        view.gifts[offset + index].progress =
          organizationChapterProgress(collection);
      }),
    );
  }
  return view;
}

export async function issueGift(id: string, key: string, value: unknown) {
  const b = inputObject(value);
  let issued: OrganizationGift | undefined;
  const accessKey = secret();
  await mutateRecord<OrganizationRecord>(keyFor(id), (stored) => {
    const organization = requireManager(stored, key);
    const receiver = contact(b.name, b.email);
    if (seatCounts(organization).available < 1)
      throw new OrganizationError(
        "Every gift is assigned. Revoke an unused gift link to make room.",
        409,
      );
    // Keep the single-record ledger bounded even after repeated revocations.
    if (organization.gifts.length >= 1000)
      throw new OrganizationError(
        "This group has reached its gift history limit. Please create another group.",
        409,
      );
    issued = {
      id: randomUUID(),
      name: receiver.name,
      email: receiver.email,
      keyHash: hash(accessKey),
      ...(b.designatedRecipient !== undefined
        ? {
            designatedRecipient: contact(
              inputObject(b.designatedRecipient).name,
              inputObject(b.designatedRecipient).email,
            ),
          }
        : {}),
      status: "issued",
      createdAt: new Date().toISOString(),
    };
    organization.gifts.push(issued);
    organization.updatedAt = issued.createdAt;
    return organization;
  });
  return {
    organization: await getOrganizationForManager(id, key),
    giftUrl: organizationJoinUrl(id, issued!.id, accessKey),
  };
}

/** Returning a new capability invalidates the previous invitation; raw secrets stay out of the ledger. */
export async function replaceGiftLink(id: string, key: string, giftId: string) {
  const accessKey = secret();
  await mutateRecord<OrganizationRecord>(keyFor(id), (stored) => {
    const organization = requireManager(stored, key);
    const gift = requireGift(organization, giftId);
    if (gift.status !== "issued")
      throw new OrganizationError(
        "Only an unused invitation can receive a new link.",
        409,
      );
    delete gift.key;
    gift.keyHash = hash(accessKey);
    organization.updatedAt = new Date().toISOString();
    return organization;
  });
  return {
    organization: await getOrganizationForManager(id, key),
    giftUrl: organizationJoinUrl(id, giftId, accessKey),
  };
}

export async function revokeGift(id: string, key: string, giftId: string) {
  await mutateRecord<OrganizationRecord>(keyFor(id), (stored) => {
    const organization = requireManager(stored, key);
    const gift = requireGift(organization, giftId);
    if (gift.status === "redeeming" || gift.status === "redeemed")
      throw new OrganizationError(
        "This gift has already been claimed and cannot be revoked.",
        409,
      );
    gift.status = "revoked";
    gift.revokedAt ||= new Date().toISOString();
    organization.updatedAt = gift.revokedAt;
    return organization;
  });
  return { organization: await getOrganizationForManager(id, key) };
}

export async function getGiftView(
  id: string,
  giftId: string,
  key: string,
): Promise<GiftView> {
  const organization = requireRecord(
    await readRecord<OrganizationRecord>(keyFor(id)),
  );
  const gift = requireGift(organization, giftId, key);
  return {
    organizationName: organization.organizationName,
    name: gift.name,
    email: gift.email,
    status: gift.status,
    ...(gift.designatedRecipient
      ? {
          designatedRecipient: {
            name: gift.designatedRecipient.name,
            email: gift.designatedRecipient.email,
          },
        }
      : {}),
  };
}

/** Reserve once, create once, finalize once. Retries recover a saved reservation. */
export async function redeemGift(
  id: string,
  giftId: string,
  key: string,
  value: unknown,
) {
  const b = inputObject(value);
  const token = typeof b.claimToken === "string" ? b.claimToken : "";
  if (!uuid.test(token))
    throw new OrganizationError(
      "Please reopen this gift page and try again.",
      400,
    );
  const tokenHash = hash(token);
  const reserved = await mutateRecord<OrganizationRecord>(
    keyFor(id),
    (stored) => {
      const organization = requireRecord(stored);
      const gift = requireGift(organization, giftId, key);
      if (gift.status === "revoked")
        throw new OrganizationError(
          "This gift link has been revoked. Ask the sender for a new link.",
          409,
        );
      if (gift.claim) {
        if (!secretMatches(gift.claim.tokenHash, tokenHash))
          throw new OrganizationError(
            "This gift has already been claimed. Continue using the private story link from that session.",
            409,
          );
        return organization;
      }
      if (gift.designatedRecipient && b.designatedRecipientConfirmed !== true)
        throw new OrganizationError(
          "Confirm the assigned recipient before starting this gift.",
          400,
        );
      let prepared: Collection;
      try {
        prepared = prepareCollection({
          ...b,
          ...(gift.designatedRecipient
            ? { recipient: gift.designatedRecipient }
            : {}),
        });
        prepared.sponsorship = { organizationId: id, giftId };
      } catch (error) {
        if (error instanceof CollectionInputError)
          throw new OrganizationError(error.message, 400);
        throw error;
      }
      gift.claim = {
        tokenHash,
        collectionId: prepared.id,
        preparedCollection: prepared,
      };
      gift.status = "redeeming";
      organization.updatedAt = new Date().toISOString();
      return organization;
    },
  );
  const claim = requireGift(reserved, giftId, key).claim!;
  let collection: Collection | null;
  if (claim.preparedCollection) {
    // The collection shares its ordinary lock, so a retry never resets saved answers.
    collection = await mutateRecord<Collection>(
      claim.collectionId,
      (existing) => existing || claim.preparedCollection!,
    );
  } else collection = await getCollection(claim.collectionId);
  if (!collection)
    throw new OrganizationError(
      "Your gift is saved, but your story page is temporarily unavailable. Please retry.",
      503,
    );
  await mutateRecord<OrganizationRecord>(keyFor(id), (stored) => {
    const organization = requireRecord(stored);
    const gift = requireGift(organization, giftId, key);
    if (!gift.claim || !secretMatches(gift.claim.tokenHash, tokenHash))
      throw new OrganizationError("This gift has already been claimed.", 409);
    gift.status = "redeemed";
    gift.redeemedAt ||= new Date().toISOString();
    delete gift.claim.preparedCollection;
    organization.updatedAt = gift.redeemedAt;
    return organization;
  });
  return { nextUrl: collectionNextUrl(collection) };
}
