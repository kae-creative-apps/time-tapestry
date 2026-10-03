import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  SecurityError,
  localSecurityBypass,
  type SecurityAction,
} from "./policy";
import { consumeLimit, opaqueIdentifier } from "./rate-limit";

export async function verifyHuman(
  req: NextRequest,
  token: unknown,
  action: SecurityAction,
) {
  if (localSecurityBypass(req)) return;
  if (typeof token !== "string" || !token || token.length > 2048)
    throw new SecurityError(
      "Please complete the security check and try again.",
      400,
    );
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret)
    throw new SecurityError("Human verification is not configured yet.", 503);
  let result: {
    success?: boolean;
    hostname?: string;
    action?: string;
    challenge_ts?: string;
  };
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          response: token,
          idempotency_key: randomUUID(),
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("Verification unavailable");
    result = await response.json();
  } catch {
    throw new SecurityError(
      "The security check could not finish. Please retry it; your details are still here.",
      503,
    );
  }
  const timestamp = Date.parse(result.challenge_ts || "");
  const expectedHost = new URL(process.env.NEXT_PUBLIC_APP_URL!).hostname;
  if (
    !result.success ||
    result.hostname !== expectedHost ||
    result.action !== action ||
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp > 300000 ||
    timestamp > Date.now() + 30000
  )
    throw new SecurityError(
      "The security check expired or was not valid for this page. Please complete it again.",
      400,
    );
  // Defense in depth against duplicate submits, in addition to Siteverify's single-use token.
  try {
    await consumeLimit(`human:${opaqueIdentifier(token)}`, 1, 600);
  } catch (error) {
    if (error instanceof SecurityError && error.status === 429)
      throw new SecurityError(
        "This security check has already been used. Please complete a new check.",
        400,
      );
    throw error;
  }
}
