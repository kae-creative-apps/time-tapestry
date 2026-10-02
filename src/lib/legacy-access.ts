import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminToken } from "./admin-auth";
export function withLegacyAdmin<
  T extends (request: NextRequest, ...args: any[]) => Promise<Response>,
>(handler: T): T {
  return (async (request: NextRequest, ...args: any[]) => {
    if (!verifyAdminToken(request.cookies.get("admin_token")?.value))
      return NextResponse.json(
        {
          error:
            "This earlier prototype tool requires admin access. Use /share or /request for the current collection.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    return handler(request, ...args);
  }) as T;
}
export async function legacyPageAllowed() {
  return verifyAdminToken((await cookies()).get("admin_token")?.value);
}
