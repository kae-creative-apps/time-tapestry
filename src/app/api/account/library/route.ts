import { NextRequest, NextResponse } from "next/server";
import { accountLibrary } from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  requireAccount,
} from "@/lib/accounts/http";
export async function GET(req: NextRequest) {
  try {
    const session = await requireAccount(req);
    return NextResponse.json(await accountLibrary(session.account), {
      headers: accountHeaders,
    });
  } catch (error) {
    return accountFailure(error);
  }
}
