import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { adminForRequest } from "@/lib/admin-auth";
import {
  adminReadHeaders,
  auditAdminRead,
  redactAdminSecrets,
} from "@/lib/admin-collections";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await adminForRequest(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: adminReadHeaders },
      );
    }
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404, headers: adminReadHeaders },
      );
    await auditAdminRead(request, "legacy_read", id);
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404, headers: adminReadHeaders },
      );
    }
    return NextResponse.json(
      { session: redactAdminSecrets(session) },
      { headers: adminReadHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to read session" },
      { status: 503, headers: adminReadHeaders },
    );
  }
}
