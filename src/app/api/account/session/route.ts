import { NextRequest, NextResponse } from "next/server";
import { accountFromSession } from "@/lib/accounts/service";
import { accountEmailAvailable } from "@/lib/accounts/mail";
import {
  accountFailure,
  accountHeaders,
  ACCOUNT_COOKIE,
} from "@/lib/accounts/http";
export async function GET(req: NextRequest) {
  try {
    const session = await accountFromSession(
      req.cookies.get(ACCOUNT_COOKIE)?.value,
    );
    return NextResponse.json(
      session
        ? {
            authenticated: true,
            email: session.account.email,
            verifiedAt: session.account.verifiedAt,
            expiresAt: session.expiresAt,
            emailLoginAvailable: accountEmailAvailable(),
          }
        : {
            authenticated: false,
            emailLoginAvailable: accountEmailAvailable(),
          },
      { headers: accountHeaders },
    );
  } catch (error) {
    return accountFailure(error);
  }
}
