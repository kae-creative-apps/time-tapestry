import { NextRequest, NextResponse } from "next/server";
import { listSessions, Session } from "@/lib/session";
import { adminForRequest } from "@/lib/admin-auth";
import {
  adminReadHeaders,
  auditAdminRead,
  redactAdminSecrets,
} from "@/lib/admin-collections";

function matchesName(session: Session, query: string): boolean {
  const q = query.toLowerCase();
  const gp = session.grandparent?.name?.toLowerCase() ?? "";
  const gc = session.grandchild?.name?.toLowerCase() ?? "";
  const family = session.familyName?.toLowerCase() ?? "";
  return (
    gp.includes(q) ||
    gc.includes(q) ||
    family.includes(q) ||
    session.id.toLowerCase().includes(q)
  );
}

function inDateRange(
  dateIso: string | undefined,
  from: string | null,
  to: string | null,
): boolean {
  if (!dateIso) return false;
  const date = new Date(dateIso);
  if (from && date < new Date(from)) return false;
  if (to && date > new Date(`${to}T23:59:59.999Z`)) return false;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await adminForRequest(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: adminReadHeaders },
      );
    }
    await auditAdminRead(request, "legacy_read");
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const name = searchParams.get("name") ?? "";

    const sessions = await listSessions();

    const filtered = sessions.filter((session) => {
      if (status && session.status !== status) return false;
      if (from || to) {
        if (!inDateRange(session.createdAt, from, to)) return false;
      }
      if (name && !matchesName(session, name)) return false;
      return true;
    });

    const summaries = filtered.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      initiationPath: session.initiationPath,
      grandparentName: session.grandparent?.name ?? "",
      grandchildName: session.grandchild?.name ?? "",
      familyName: session.familyName ?? "",
      interviewStartedAt: session.interview?.startedAt,
      interviewCompletedAt: session.interview?.completedAt,
      storyApprovedAt: session.story?.approvedAt,
      postcardsScheduledCount: session.postcardsScheduled?.length ?? 0,
    }));

    return NextResponse.json(
      { sessions: summaries },
      { headers: adminReadHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to list sessions" },
      { status: 503, headers: adminReadHeaders },
    );
  }
}
