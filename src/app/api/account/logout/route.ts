import { NextRequest, NextResponse } from "next/server";
import { assertOrigin } from "@/lib/security/policy";
import { revokeAccountSession } from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  cookieOptions,
  ACCOUNT_COOKIE,
} from "@/lib/accounts/http";
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await revokeAccountSession(req.cookies.get(ACCOUNT_COOKIE)?.value);
    const response = NextResponse.json(
      { ok: true },
      { headers: accountHeaders },
    );
    response.cookies.set(ACCOUNT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return accountFailure(error);
  }
}
