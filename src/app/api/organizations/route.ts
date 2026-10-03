import { NextRequest, NextResponse } from "next/server";
import { createOrganization } from "@/lib/organizations/service";
import {
  organizationBody,
  organizationFailure,
  privateHeaders,
} from "@/lib/organizations/http";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(
      await createOrganization(await organizationBody(req)),
      {
        status: 201,
        headers: privateHeaders,
      },
    );
  } catch (error) {
    return organizationFailure(error);
  }
}
