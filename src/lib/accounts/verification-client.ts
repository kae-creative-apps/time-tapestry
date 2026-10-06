import { collectionRequest } from "../collection/client-request";
import { adminReturnPath } from "../admin-policy";

export type AccountVerificationView = {
  emailHint: string;
  expiresAt: string;
  canConfirm: boolean;
  reason?: string;
};

export function readAccountVerification(token: string, signal?: AbortSignal) {
  return collectionRequest<AccountVerificationView>(
    "/api/account/verification",
    { signal, headers: { "X-Account-Verification": token } },
    20000,
  );
}

export async function finishAccountVerification(token: string) {
  const result = await collectionRequest<{ nextUrl?: unknown }>(
    "/api/account/verify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    },
    20000,
  );
  // Navigation is not authorization. The destination rechecks the verified session.
  if (
    typeof result.nextUrl === "string" &&
    result.nextUrl === adminReturnPath(result.nextUrl)
  )
    return result.nextUrl;
  // Only server-derived, keyless recipient routes may follow sign-in.
  return typeof result.nextUrl === "string" &&
    /^\/collection\/[a-zA-Z0-9_-]{8,80}(?:\/(?:chapter\/q[1-4]|address|stories))?$/.test(
      result.nextUrl,
    )
    ? result.nextUrl
    : "/account";
}
