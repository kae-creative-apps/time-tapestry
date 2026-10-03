import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { putCollection } from "@/lib/collection/store";
import {
  prepareCollection,
  collectionCreationResult,
  CollectionInputError,
} from "@/lib/collection/create";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    await guardRequest(req, {
      action: "create_collection",
      requireHuman: true,
      humanToken: body.humanToken,
    });
    const collection = prepareCollection(body);
    await putCollection(collection);
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
