import { NextRequest, NextResponse } from "next/server";
import { putCollection } from "@/lib/collection/store";
import {
  prepareCollection,
  collectionCreationResult,
  CollectionInputError,
} from "@/lib/collection/create";

export async function POST(req: NextRequest) {
  try {
    const collection = prepareCollection(await req.json());
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
