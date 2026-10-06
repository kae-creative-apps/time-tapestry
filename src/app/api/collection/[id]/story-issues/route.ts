import { NextRequest, NextResponse } from "next/server";
import { getCollection, mutateCollection } from "@/lib/collection/store";
import { collectionRoleForRequest } from "@/lib/collection/request-access";
import { applyStoryIssue, storyIssueView } from "@/lib/collection/story-issues";
import { guardRequest, SecurityError } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  return (
    securityErrorResponse(error) ??
    NextResponse.json(
      {
        error:
          "The detail could not be saved. Your story is unchanged. Please try again.",
      },
      { status: 503, headers },
    )
  );
}
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || (await collectionRoleForRequest(req, c)) !== "owner")
      throw new SecurityError("Storyteller access required.", 403);
    return NextResponse.json(storyIssueView(c), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const initial = await getCollection(id);
    if (!initial || (await collectionRoleForRequest(req, initial)) !== "owner")
      throw new SecurityError("Storyteller access required.", 403);
    await guardRequest(req, { action: "collection_write", resourceId: id });
    const body = await readJsonBody(req, 4096);
    const c = await mutateCollection(id, async (current) => {
      if ((await collectionRoleForRequest(req, current)) !== "owner")
        throw new SecurityError("Storyteller access required.", 403);
      return applyStoryIssue(current, body);
    });
    return NextResponse.json(storyIssueView(c), { headers });
  } catch (error) {
    return failure(error);
  }
}
