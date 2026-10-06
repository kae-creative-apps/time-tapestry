import { NextRequest, NextResponse } from "next/server";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { livingStoryView } from "@/lib/collection/living-story-view";
import { applyLivingStoryAction } from "@/lib/collection/living-story";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { SecurityError } from "@/lib/security/policy";

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
type Context = { params: Promise<{ id: string }> };
const errorResponse = (error: unknown) =>
  securityErrorResponse(error) ??
  NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Your story could not be saved. Please try again.",
    },
    { status: 400, headers },
  );

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const access = c && (await collectionAccessForRequest(req, c));
    if (!c || !access || access.role === "requester")
      throw new SecurityError(
        "Open your storyteller link or verified family account to see new stories.",
        403,
      );
    return NextResponse.json(
      { livingStory: livingStoryView(c, access.role) },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const initial = await getCollection(id);
    const initialAccess =
      initial && (await collectionAccessForRequest(req, initial));
    if (!initial || !initialAccess || initialAccess.role === "requester")
      throw new SecurityError(
        "Open your storyteller link or verified family account to save a story request.",
        403,
      );
    await guardRequest(req, { action: "collection_write", resourceId: id });
    const body = await readJsonBody(req, 16 * 1024);
    let responseRole = initialAccess.role;
    const c = await mutateCollection(id, async (current) => {
      const access = await collectionAccessForRequest(req, current);
      if (!access || access.role === "requester")
        throw new SecurityError(
          "Story access has changed. Sign in again.",
          403,
        );
      responseRole = access.role;
      return applyLivingStoryAction(current, access, body);
    });
    return NextResponse.json(
      { livingStory: livingStoryView(c, responseRole) },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
