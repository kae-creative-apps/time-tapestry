import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { recipientById } from "@/lib/collection/recipients";
import {
  renderStoryBook,
  storyBookSnapshot,
  StoryBookError,
} from "@/lib/collection/story-book";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? await getCollection(id) : null;
    const access = c && (await collectionAccessForRequest(req, c));
    const draft = req.nextUrl.searchParams.get("draft") === "1";
    if (
      !c ||
      !access ||
      access.role === "requester" ||
      (draft ? access.role !== "owner" : c.status !== "approved")
    )
      return NextResponse.json(
        {
          error:
            "This private story book is unavailable. Open your approved collection to continue.",
        },
        { status: 403, headers },
      );
    const recipient = recipientById(
      c,
      access.role === "recipient" ? access.recipientId : undefined,
    );
    if (!recipient)
      return NextResponse.json(
        { error: "This private story book is unavailable." },
        { status: 403, headers },
      );
    const bytes = await renderStoryBook(
      storyBookSnapshot(c, recipient.name.trim() || "you", { draft }),
    );
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="time-tapestry-stories.pdf"',
        "Content-Length": String(bytes.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof StoryBookError
            ? error.message
            : "Your book could not be prepared right now. Your stories are still saved. Please try again.",
      },
      {
        status: error instanceof StoryBookError ? 422 : 503,
        headers,
      },
    );
  }
}
