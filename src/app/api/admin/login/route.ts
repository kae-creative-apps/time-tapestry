import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody } from "@/lib/security/http";
import { consumeLimit, opaqueIdentifier } from "@/lib/security/rate-limit";
import { SecurityError } from "@/lib/security/policy";
import {
  beginAccountLogin,
  LOGIN_LIFETIME_SECONDS,
  normalizeAccountEmail,
  randomCredential,
} from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  cookieOptions,
  REQUEST_COOKIE,
} from "@/lib/accounts/http";
import { adminReturnPath, isAdminEmail } from "@/lib/admin-policy";

export async function POST(req: NextRequest) {
  try {
    await guardRequest(req, { action: "admin_login" });
    const body = await readJsonBody(req, 8192);
    const email = normalizeAccountEmail(body.email);
    await guardRequest(req, {
      action: "account_login",
      requireHuman: true,
      humanToken: body.humanToken,
    });
    if (!isAdminEmail(email))
      throw new SecurityError(
        "Use an approved team email to request admin access.",
        403,
      );
    await consumeLimit(`account-email:${opaqueIdentifier(email)}`, 4, 3600);
    await consumeLimit(
      `account-email-cooldown:${opaqueIdentifier(email)}`,
      1,
      60,
    );
    const nonce = randomCredential();
    const result = await beginAccountLogin(
      email,
      nonce,
      undefined,
      undefined,
      adminReturnPath(body.redirect),
    );
    const response = NextResponse.json(result, {
      status: 202,
      headers: accountHeaders,
    });
    response.cookies.set(REQUEST_COOKIE, nonce, {
      ...cookieOptions,
      maxAge: LOGIN_LIFETIME_SECONDS,
    });
    return response;
  } catch (error) {
    return accountFailure(error);
  }
}
