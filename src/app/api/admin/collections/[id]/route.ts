import { NextRequest, NextResponse } from "next/server";
import {
  adminAuthorized,
  adminCollectionDetail,
  adminReadHeaders,
  auditAdminRead,
} from "@/lib/admin-collections";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await adminAuthorized(req)))
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: adminReadHeaders },
      );
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      return NextResponse.json(
        { error: "Collection not found." },
        { status: 404, headers: adminReadHeaders },
      );
    const detail = await adminCollectionDetail(id);
    if (!detail)
      return NextResponse.json(
        { error: "Collection not found." },
        { status: 404, headers: adminReadHeaders },
      );
    const download = req.nextUrl.searchParams.get("download") === "1";
    await auditAdminRead(req, download ? "export" : "detail", id);
    return NextResponse.json(detail, {
      headers: {
        ...adminReadHeaders,
        ...(download
          ? {
              "Content-Disposition": `attachment; filename="time-tapestry-${id}.json"`,
            }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "This collection is temporarily unavailable." },
      { status: 503, headers: adminReadHeaders },
    );
  }
}
