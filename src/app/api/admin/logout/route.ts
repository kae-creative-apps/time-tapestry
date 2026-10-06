import { NextRequest, NextResponse } from "next/server";
import { revokeAccountSession } from "@/lib/accounts/service";
import {
  ACCOUNT_COOKIE,
  accountFailure,
  accountHeaders,
  cookieOptions,
} from "@/lib/accounts/http";
import { assertOrigin } from "@/lib/security/policy";

export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    await revokeAccountSession(req.cookies.get(ACCOUNT_COOKIE)?.value);
    const response = NextResponse.json(
      { ok: true },
      { headers: accountHeaders },
    );
    for (const name of [ACCOUNT_COOKIE, "admin_token"])
      response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    return accountFailure(error);
  }
}
