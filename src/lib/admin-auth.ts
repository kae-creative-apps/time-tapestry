import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE = "admin_token";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 7;
export function getAdminSecret(): string {
  return process.env.ADMIN_SECRET ?? "";
}
function equal(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function verifyAdminSecret(input: unknown): boolean {
  const secret = getAdminSecret();
  return Boolean(secret && typeof input === "string" && equal(input, secret));
}
function signature(payload: string) {
  return createHmac("sha256", getAdminSecret())
    .update(`admin-session:${payload}`)
    .digest("base64url");
}
export function createAdminSession(now = Date.now()): string {
  if (!getAdminSecret()) throw new Error("Admin access is not configured.");
  const payload = `v1.${Math.floor(now / 1000) + ADMIN_SESSION_SECONDS}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${signature(payload)}`;
}
export function verifyAdminToken(
  token: string | undefined,
  now = Date.now(),
): boolean {
  if (!getAdminSecret() || !token || token.length > 200) return false;
  const parts = token.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !/^\d{10}$/.test(parts[1]) ||
    !/^[a-f0-9]{48}$/.test(parts[2])
  )
    return false;
  const expires = Number(parts[1]),
    seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + ADMIN_SESSION_SECONDS)
    return false;
  return equal(parts[3], signature(parts.slice(0, 3).join(".")));
}
export function getAdminTokenFromRequest(
  request: NextRequest,
): string | undefined {
  return request.cookies.get(ADMIN_COOKIE)?.value;
}
export function adminUnauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
