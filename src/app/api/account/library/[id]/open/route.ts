import { NextRequest, NextResponse } from "next/server";
import { accountCollectionPath } from "@/lib/accounts/service";
import {
  accountFailure,
  accountHeaders,
  requireAccount,
} from "@/lib/accounts/http";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAccount(req),
      { id } = await params;
    const next = await accountCollectionPath(session.account, id);
    // Relative Location keeps private access on this application, never a caller-selected host.
    return new NextResponse(null, {
      status: 303,
      headers: { ...accountHeaders, Location: next },
    });
  } catch (error) {
    return accountFailure(error);
  }
}
