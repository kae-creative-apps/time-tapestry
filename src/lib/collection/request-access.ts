import type { NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "../accounts/http";
import { accountFromSession } from "../accounts/service";
import { roleFor } from "./access";
import type { Collection, CollectionView } from "./types";

/** A postcard locates a collection. It never proves that its holder is the recipient. */
export async function collectionRoleForRequest(
  req: NextRequest,
  c: Collection,
): Promise<CollectionView["role"] | null> {
  const capabilityRole = roleFor(c, req.nextUrl.searchParams.get("key") || "");
  if (capabilityRole === "owner" || capabilityRole === "requester")
    return capabilityRole;
  const session = await accountFromSession(
    req.cookies.get(ACCOUNT_COOKIE)?.value,
  );
  if (
    session &&
    c.recipient.email.trim().toLowerCase() ===
      session.account.email.trim().toLowerCase()
  )
    return "recipient";
  return null;
}
