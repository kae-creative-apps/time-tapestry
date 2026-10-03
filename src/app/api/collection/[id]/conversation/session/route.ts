import { SecurityError } from "@/lib/security/policy";
import { roleFor } from "@/lib/collection/access";
import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
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
    const role = roleFor(c, req.nextUrl.searchParams.get("key") || "");
    if (!role)
      throw new ConversationSessionError(
        "This private link is not valid.",
        404,
        false,
      );
    if (role !== "owner")
      return NextResponse.json(
        { error: "Open your interview link to continue." },
        { status: 403, headers },
      );
    await guardRequest(req, { action: "ai_session", resourceId: id });
    let sessionId: string | undefined;
    let connectionType: "webrtc" | "websocket" = "webrtc";
    if (req.body) {
      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req, 1024);
      } catch (error) {
        if (error instanceof SecurityError && [400, 413].includes(error.status))
          throw new ConversationSessionError(
            "Please reopen your interview page.",
            400,
            false,
          );
        throw error;
      }
      const value = (body as { sessionId?: unknown }).sessionId;
      const transport = (body as { connectionType?: unknown }).connectionType;
      if (transport !== undefined) {
        if (transport !== "webrtc" && transport !== "websocket")
          throw new ConversationSessionError(
            "Choose a supported interview connection.",
            400,
            false,
          );
        connectionType = transport;
      }
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
      undefined,
      connectionType,
    );
    return NextResponse.json(session, { headers });
  } catch (error) {
    const protection = securityErrorResponse(error);
    if (protection) return protection;
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
