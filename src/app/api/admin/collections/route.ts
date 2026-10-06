import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthorized,
  adminCollectionList,
  adminReadHeaders,
  auditAdminRead,
} from "@/lib/admin-collections";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    if (!(await adminAuthorized(req)))
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: adminReadHeaders },
      );
    const rawOffset = Number(req.nextUrl.searchParams.get("offset") || 0),
      rawLimit = Number(req.nextUrl.searchParams.get("limit") || 50);
    if (
      !Number.isSafeInteger(rawOffset) ||
      rawOffset < 0 ||
      !Number.isSafeInteger(rawLimit) ||
      rawLimit < 1
    )
      return NextResponse.json(
        { error: "Invalid pagination." },
        { status: 400, headers: adminReadHeaders },
      );
    await auditAdminRead(req, "list");
    return NextResponse.json(
      await adminCollectionList(rawOffset, Math.min(rawLimit, 50)),
      { headers: adminReadHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Collection records are temporarily unavailable." },
      { status: 503, headers: adminReadHeaders },
    );
  }
}
