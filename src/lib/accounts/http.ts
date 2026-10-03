import { NextRequest, NextResponse } from "next/server";
import { accountFromSession } from "./service";
import { SecurityError } from "../security/policy";
import { securityErrorResponse } from "../security/http";
export const ACCOUNT_COOKIE = "tt_account_session";
export const REQUEST_COOKIE = "tt_login_request";
export const accountHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function requireAccount(req: NextRequest) {
  const session = await accountFromSession(
    req.cookies.get(ACCOUNT_COOKIE)?.value,
  );
  if (!session)
    throw new SecurityError("Sign in to open your story library.", 401);
  return session;
}
export function accountFailure(error: unknown) {
  const response =
    securityErrorResponse(error) ||
    NextResponse.json(
      {
        error:
          "Your account is temporarily unavailable. Your saved stories have not changed.",
      },
      { status: 503 },
    );
  for (const [name, value] of Object.entries(accountHeaders))
    response.headers.set(name, value);
  return response;
}
