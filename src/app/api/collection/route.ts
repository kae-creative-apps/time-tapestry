import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { createCollectionRequest } from "@/lib/collection/create-request";
import { verifyHuman } from "@/lib/security/human";
import {
  collectionCreationResult,
  CollectionInputError,
} from "@/lib/collection/create";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    await guardRequest(req, { action: "create_collection" });
    const collection = await createCollectionRequest(body, () =>
      verifyHuman(req, body.humanToken, "create_collection"),
    );
    // Sending is performed by the authenticated delivery worker, never represented as sent here.
    return NextResponse.json(collectionCreationResult(collection), {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    const protection = securityErrorResponse(e);
    if (protection) return protection;
    const invalid =
      e instanceof CollectionInputError || e instanceof SyntaxError;
    return NextResponse.json(
      {
        error:
          e instanceof CollectionInputError
            ? e.message
            : invalid
              ? "Please provide valid collection details."
              : "Unable to start your gift. Please try again.",
      },
      { status: invalid ? 400 : 503 },
    );
  }
}
