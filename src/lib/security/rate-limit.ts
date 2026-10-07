import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { kv, kvConfigured } from "../kv-client";
import type { NextRequest } from "next/server";
import { mutateRecord } from "../collection/store";
import { SecurityError, localSecurityBypass } from "./policy";

export function opaqueIdentifier(value: string) {
  const salt =
    process.env.SECURITY_HASH_SECRET ||
    process.env.TURNSTILE_SECRET_KEY ||
    "local-development-only";
  return createHmac("sha256", salt).update(value).digest("hex");
}
export function clientBucket(req: NextRequest) {
  if (localSecurityBypass(req)) return "local-preview";
  if (process.env.VERCEL) {
    const value =
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      "";
    const address = value.split(",")[0].trim();
    if (!isIP(address))
      throw new SecurityError(
        "We could not verify this connection. Please try again.",
        503,
      );
    return opaqueIdentifier(`ip:${address}`);
  }
  // Untrusted proxy headers must not let callers choose or evade their bucket.
  return "shared-hosted-connection";
}
export async function consumeLimit(
  identity: string,
  count: number,
  seconds: number,
  now = Date.now(),
) {
  const key = `guard-${opaqueIdentifier(identity)}`;
  let used: number;
  let retryAfter: number;
  if (kvConfigured()) {
    const result = await kv
      .eval(
        "local n=redis.call('incr',KEYS[1]); if n==1 then redis.call('expire',KEYS[1],ARGV[1]) end; return {n,redis.call('ttl',KEYS[1])}",
        [`security:${key}`],
        [seconds],
      )
      .catch(() => {
        throw new SecurityError(
          "Activity protection is temporarily unavailable. Please try again.",
          503,
        );
      });
    if (!Array.isArray(result) || result.length !== 2)
      throw new SecurityError(
        "Activity protection is temporarily unavailable.",
        503,
      );
    used = Number(result[0]);
    retryAfter = Math.max(1, Number(result[1]));
  } else {
    if (process.env.VERCEL)
      throw new SecurityError(
        "Activity protection is temporarily unavailable. Please try again.",
        503,
      );
    const record = await mutateRecord<{
      recordType: string;
      startedAt: number;
      count: number;
    }>(key, (current) => {
      const active =
        current && now - current.startedAt < seconds * 1000
          ? current
          : { recordType: "rate-limit", startedAt: now, count: 0 };
      return { ...active, count: active.count + 1 };
    });
    used = record.count;
    retryAfter = Math.max(
      1,
      Math.ceil((record.startedAt + seconds * 1000 - now) / 1000),
    );
  }
  if (!Number.isFinite(used) || !Number.isFinite(retryAfter))
    throw new SecurityError(
      "Activity protection is temporarily unavailable. Please retry.",
      503,
    );
  if (used > count)
    throw new SecurityError(
      "Please take a moment before trying again. Your saved work is safe.",
      429,
      retryAfter,
    );
}
