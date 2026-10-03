import { NextRequest, NextResponse } from "next/server";
import { verificationView } from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  REQUEST_COOKIE,
} from "@/lib/accounts/http";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(
      await verificationView(
        req.headers.get("x-account-verification"),
        req.cookies.get(REQUEST_COOKIE)?.value,
      ),
      { headers: accountHeaders },
    );
  } catch (error) {
    return accountFailure(error);
  }
}
