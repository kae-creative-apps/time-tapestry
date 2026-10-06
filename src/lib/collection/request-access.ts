import type { NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "../accounts/http";
import { accountFromSession } from "../accounts/service";
import { roleFor } from "./access";
import type { Collection, CollectionView } from "./types";
import { recipientForEmail } from "./recipients";

export type CollectionAccess = {
  role: CollectionView["role"];
  recipientId?: string;
  isPrimaryRecipient?: boolean;
};

/** A postcard locates a collection. It never proves that its holder is the recipient. */
export async function collectionAccessForRequest(
  req: NextRequest,
  c: Collection,
): Promise<CollectionAccess | null> {
  const capabilityRole = roleFor(c, req.nextUrl.searchParams.get("key") || "");
  if (capabilityRole === "owner" || capabilityRole === "requester")
    return { role: capabilityRole };
  const session = await accountFromSession(
    req.cookies.get(ACCOUNT_COOKIE)?.value,
  );
  const recipient = session && recipientForEmail(c, session.account.email);
  if (recipient)
    return {
      role: "recipient",
      recipientId: recipient.id,
      isPrimaryRecipient: recipient.primary,
    };
  return null;
}

export async function collectionRoleForRequest(
  req: NextRequest,
  c: Collection,
): Promise<CollectionView["role"] | null> {
  return (await collectionAccessForRequest(req, c))?.role ?? null;
}
