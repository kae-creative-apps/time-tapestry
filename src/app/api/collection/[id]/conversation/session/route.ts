import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import {
  ConversationSessionError,
  createInterviewSession,
} from "@/lib/collection/conversation-agent";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const origin = req.headers.get("origin");
    if (
      (origin && origin !== req.nextUrl.origin) ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      return NextResponse.json(
        { configured: false, error: "Open your interview page to continue." },
        { status: 403, headers },
      );
    const { id } = await params;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new ConversationSessionError(
        "This private link is not valid.",
        404,
        false,
      );
    const c = await getCollection(id);
    if (!c)
      throw new ConversationSessionError(
        "This private link is not valid.",
        404,
        false,
      );
    const text = await req.text();
    if (text.length > 1024)
      throw new ConversationSessionError(
        "Please reopen your interview page.",
        400,
        false,
      );
    let sessionId: string | undefined;
    if (text) {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ConversationSessionError(
          "Please reopen your interview page.",
          400,
          false,
        );
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new ConversationSessionError(
          "Please reopen your interview page.",
          400,
          false,
        );
      const value = (body as { sessionId?: unknown }).sessionId;
      if (value !== undefined) {
        if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(value))
          throw new ConversationSessionError(
            "Please reopen your interview page.",
            400,
            false,
          );
        sessionId = value;
      }
    }
    const session = await createInterviewSession(
      c,
      req.nextUrl.searchParams.get("key") || "",
      sessionId,
    );
    return NextResponse.json(session, { headers });
  } catch (error) {
    const known = error instanceof ConversationSessionError;
    return NextResponse.json(
      {
        configured: known ? error.configured : false,
        error: known
          ? error.message
          : "We cannot open the interview right now. Please try again.",
      },
      { status: known ? error.status : 503, headers },
    );
  }
}
