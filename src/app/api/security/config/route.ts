import { NextRequest, NextResponse } from "next/server";
import { securityConfiguration } from "@/lib/security/policy";
export function GET(req: NextRequest) {
  const { required, siteKey, configured } = securityConfiguration(req);
  return NextResponse.json(
    { required, siteKey, configured },
    { headers: { "Cache-Control": "no-store" } },
  );
}
