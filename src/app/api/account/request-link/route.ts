import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { consumeLimit, opaqueIdentifier } from "@/lib/security/rate-limit";
import { readJsonBody } from "@/lib/security/http";
import {
  beginAccountLogin,
  normalizeAccountEmail,
  normalizeRecipientLocator,
  randomCredential,
  LOGIN_LIFETIME_SECONDS,
} from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  cookieOptions,
  REQUEST_COOKIE,
} from "@/lib/accounts/http";
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, 8192);
    const email = normalizeAccountEmail(body.email);
    const recipientLocator = normalizeRecipientLocator(body.recipientLocator);
    await guardRequest(req, {
      action: "account_login",
      requireHuman: true,
      humanToken: body.humanToken,
    });
    await consumeLimit(`account-email:${opaqueIdentifier(email)}`, 4, 3600);
    await consumeLimit(
      `account-email-cooldown:${opaqueIdentifier(email)}`,
      1,
      60,
    );
    const nonce = randomCredential(),
      result = await beginAccountLogin(
        email,
        nonce,
        undefined,
        recipientLocator,
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
