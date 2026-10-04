import { NextRequest, NextResponse } from "next/server";
import { getOrganizationForManager } from "@/lib/organizations/service";
import { organizationFailure, privateHeaders } from "@/lib/organizations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const organization = await getOrganizationForManager(
      id,
      req.nextUrl.searchParams.get("key") || "",
    );
    return NextResponse.json({ organization }, { headers: privateHeaders });
  } catch (error) {
    return organizationFailure(error);
  }
}
