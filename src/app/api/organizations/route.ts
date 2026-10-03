import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/request";
import { createOrganization } from "@/lib/organizations/service";
import {
  organizationBody,
  organizationFailure,
  privateHeaders,
} from "@/lib/organizations/http";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body = await organizationBody(req);
    await guardRequest(req, {
      action: "create_organization",
      requireHuman: true,
      humanToken: body.humanToken,
    });
    return NextResponse.json(await createOrganization(body), {
      status: 201,
      headers: privateHeaders,
    });
  } catch (error) {
    return organizationFailure(error);
  }
}
