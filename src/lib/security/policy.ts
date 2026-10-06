import type { NextRequest } from "next/server";

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}
export type SecurityAction =
  | "create_collection"
  | "create_organization"
  | "claim_gift"
  | "issue_gift"
  | "verify_address"
  | "ai_session"
  | "transcribe"
  | "speak"
  | "generate"
  | "followup"
  | "render_film"
  | "upload"
  | "contact"
  | "admin_login"
  | "interview_write"
  | "collection_write"
  | "account_login"
  | "account_verify";
export const paidActions = new Set<SecurityAction>([
  "ai_session",
  "transcribe",
  "speak",
  "generate",
  "followup",
  "render_film",
  "verify_address",
]);
export const limits: Record<
  SecurityAction,
  { count: number; seconds: number }
> = {
  create_collection: { count: 10, seconds: 3600 },
  create_organization: { count: 5, seconds: 3600 },
  claim_gift: { count: 20, seconds: 600 },
  issue_gift: { count: 150, seconds: 600 },
  verify_address: { count: 30, seconds: 600 },
  ai_session: { count: 10, seconds: 300 },
  transcribe: { count: 60, seconds: 3600 },
  speak: { count: 120, seconds: 3600 },
  generate: { count: 10, seconds: 3600 },
  followup: { count: 40, seconds: 3600 },
  render_film: { count: 5, seconds: 3600 },
  upload: { count: 120, seconds: 3600 },
  contact: { count: 5, seconds: 3600 },
  admin_login: { count: 8, seconds: 900 },
  interview_write: { count: 3000, seconds: 3600 },
  collection_write: { count: 3000, seconds: 3600 },
  account_login: { count: 12, seconds: 3600 },
  account_verify: { count: 20, seconds: 600 },
};
export const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]", "::1"].includes(host);
export function localSecurityBypass(req: NextRequest) {
  return (
    !process.env.VERCEL &&
    loopback(req.nextUrl.hostname) &&
    (process.env.NODE_ENV === "development" ||
      process.env.SECURITY_LOCAL_BYPASS === "true")
  );
}
/** Public visitors cannot use a local worker's security bypass. */
export function hostedSecurityConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
    process.env.TURNSTILE_SECRET_KEY &&
    process.env.KV_REST_API_URL &&
    process.env.KV_REST_API_TOKEN &&
    process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"),
  );
}
export function securityConfiguration(req: NextRequest) {
  const localBypass = localSecurityBypass(req);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const configured = localBypass || hostedSecurityConfigured();
  return { localBypass, required: !localBypass, siteKey, configured };
}
export function assertOrigin(req: NextRequest) {
  const local = localSecurityBypass(req);
  let expected: string;
  try {
    expected = local
      ? req.nextUrl.origin
      : new URL(process.env.NEXT_PUBLIC_APP_URL || "").origin;
  } catch {
    throw new SecurityError(
      "The site needs a security setup check before accepting changes.",
      503,
    );
  }
  const origin = req.headers.get("origin");
  if (
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== expected) ||
    (!local && !origin)
  )
    throw new SecurityError(
      "Open this page on Time Tapestry to continue.",
      403,
    );
}
export function requireSecurityConfiguration(req: NextRequest) {
  if (!securityConfiguration(req).configured)
    throw new SecurityError(
      "New activity is temporarily unavailable while we finish security setup. Your saved stories remain available.",
      503,
    );
}
