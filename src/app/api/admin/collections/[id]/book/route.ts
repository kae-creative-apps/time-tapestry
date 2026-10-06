import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminReadHeaders, auditAdminRead } from "@/lib/admin-collections";
import { getCollection } from "@/lib/collection/store";
import {
  renderStoryBook,
  storyBookSnapshot,
  StoryBookError,
} from "@/lib/collection/story-book";
import { SecurityError } from "@/lib/security/policy";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const c = /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? await getCollection(id) : null;
    if (!c)
      return NextResponse.json(
        { error: "Collection not found." },
        { status: 404, headers: adminReadHeaders },
      );
    await auditAdminRead(req, "book", id);
    const draft = c.status !== "approved";
    const bytes = await renderStoryBook(
      storyBookSnapshot(c, c.recipient.name || "you", { draft }),
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...adminReadHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="time-tapestry-${draft ? "draft-" : ""}book.pdf"`,
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SecurityError || error instanceof StoryBookError
            ? error.message
            : "The private book is temporarily unavailable.",
      },
      {
        status:
          error instanceof SecurityError
            ? error.status
            : error instanceof StoryBookError
              ? 422
              : 503,
        headers: adminReadHeaders,
      },
    );
  }
}
