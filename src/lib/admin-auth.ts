import type { NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "./accounts/http";
import { accountFromSession } from "./accounts/service";
import { isAdminEmail } from "./admin-policy";
import { SecurityError } from "./security/policy";

/** Authorization comes only from a live server session after email verification. */
export async function adminFromSession(token: unknown, now = Date.now()) {
  const session = await accountFromSession(token, now);
  return session && isAdminEmail(session.account.email) ? session : null;
}
export function adminForRequest(req: NextRequest) {
  return adminFromSession(req.cookies.get(ACCOUNT_COOKIE)?.value);
}
export async function requireAdmin(req: NextRequest) {
  const session = await adminForRequest(req);
  if (!session)
    throw new SecurityError(
      "Sign in with an approved team email to continue.",
      401,
    );
  return session;
}
