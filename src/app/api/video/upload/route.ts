import { withLegacyAdmin } from "@/lib/legacy-access";
import { type NextRequest, NextResponse } from "next/server";

async function legacyPOST(_request: NextRequest) {
  return NextResponse.json(
    {
      error:
        "This earlier public recording upload has been retired. Open /share or /request and use your private collection's recording controls instead.",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withLegacyAdmin(legacyPOST);
