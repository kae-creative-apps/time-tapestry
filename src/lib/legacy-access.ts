import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminForRequest, adminFromSession } from "./admin-auth";
import { ACCOUNT_COOKIE } from "./accounts/http";
import {
  adminReadHeaders,
  auditAdminRead,
  redactAdminSecrets,
} from "./admin-collections";
import { assertOrigin } from "./security/policy";
import { securityErrorResponse } from "./security/http";
export function withLegacyAdmin<
  T extends (request: NextRequest, ...args: any[]) => Promise<Response>,
>(handler: T): T {
  return (async (request: NextRequest, ...args: any[]) => {
    if (!(await adminForRequest(request)))
      return NextResponse.json(
        {
          error:
            "This earlier prototype tool requires admin access. Use /share or /request for the current collection.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    if (!["GET", "HEAD"].includes(request.method)) {
      try {
        assertOrigin(request);
      } catch (error) {
        return securityErrorResponse(error)!;
      }
    }
    await auditAdminRead(
      request,
      ["GET", "HEAD"].includes(request.method) ? "legacy_read" : "legacy_write",
    );
    const response = await handler(request, ...args);
    if (response.headers.get("content-type")?.includes("application/json")) {
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(adminReadHeaders))
        headers.set(name, value);
      headers.delete("content-length");
      return NextResponse.json(redactAdminSecrets(await response.json()), {
        status: response.status,
        headers,
      });
    }
    return response;
  }) as T;
}
export async function legacyPageAllowed() {
  return Boolean(
    await adminFromSession((await cookies()).get(ACCOUNT_COOKIE)?.value),
  );
}
