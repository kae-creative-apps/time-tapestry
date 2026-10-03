import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody } from "@/lib/security/http";
import {
  confirmAccountLogin,
  ACCOUNT_SESSION_SECONDS,
} from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  cookieOptions,
  REQUEST_COOKIE,
  ACCOUNT_COOKIE,
} from "@/lib/accounts/http";
export async function POST(req: NextRequest) {
  try {
    await guardRequest(req, { action: "account_verify" });
    const body = await readJsonBody(req, 4096);
    const result = await confirmAccountLogin(
      body.token,
      req.cookies.get(REQUEST_COOKIE)?.value,
    );
    const response = NextResponse.json(
      { ok: true, nextUrl: "/account" },
      { headers: accountHeaders },
    );
    response.cookies.set(ACCOUNT_COOKIE, result.sessionToken, {
      ...cookieOptions,
      maxAge: ACCOUNT_SESSION_SECONDS,
    });
    response.cookies.set(REQUEST_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return accountFailure(error);
  }
}
