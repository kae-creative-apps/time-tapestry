import { withLegacyAdmin } from "@/lib/legacy-access";
import { type NextRequest, NextResponse } from "next/server";

async function legacyPOST(_request: NextRequest) {
  return NextResponse.json(
    {
      error:
        "This earlier interview tool has been retired. Open /share or /request to record a private collection. Previously saved stories remain available.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withLegacyAdmin(legacyPOST);
