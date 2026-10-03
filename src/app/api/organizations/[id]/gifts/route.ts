import { guardRequest } from "@/lib/security/request";
import { NextRequest, NextResponse } from "next/server";
import {
  getOrganizationForManager,
  issueGift,
  revokeGift,
  OrganizationError,
} from "@/lib/organizations/service";
import {
  organizationBody,
  organizationFailure,
  privateHeaders,
} from "@/lib/organizations/http";

export const runtime = "nodejs";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const key = req.nextUrl.searchParams.get("key") || "";
    // Authorize before parsing contacts. Mutations repeat this check under the lock.
    await getOrganizationForManager(id, key);
    await guardRequest(req, { action: "issue_gift", resourceId: id });
    const body = await organizationBody(req);
    if (body.action !== undefined && body.action !== "revoke")
      throw new OrganizationError("This gift action is not available.", 400);
    const result =
      body.action === "revoke"
        ? await revokeGift(
            id,
            key,
            typeof body.giftId === "string" ? body.giftId : "",
          )
        : await issueGift(id, key, body);
    return NextResponse.json(result, {
      status: body.action === "revoke" ? 200 : 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return organizationFailure(error);
  }
}
