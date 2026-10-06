import { guardRequest, SecurityError } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { stripConversationPerformanceCues } from "@/lib/collection/conversation-copy";
import {
  interviewerVoiceConfigured,
  streamTextToSpeech,
} from "@/lib/elevenlabs-client";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || roleFor(c, req.nextUrl.searchParams.get("key") || "") !== "owner")
      return NextResponse.json(
        { error: "Storyteller access required" },
        { status: 403 },
      );
    const guard = await guardRequest(req, { action: "speak", resourceId: id });
    const b = await readJsonBody(req);
    if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 1200)
      throw new SecurityError(
        "Provide a question of 1 to 1,200 characters.",
        400,
      );
    const spokenText = stripConversationPerformanceCues(b.text);
    if (!spokenText.trim())
      throw new SecurityError("There is no question to read.", 400);
    if (!interviewerVoiceConfigured())
      return NextResponse.json(
        {
          error:
            "The sound is not configured. You can read the question on screen and try again later.",
        },
        { status: 503 },
      );
    const stream = await streamTextToSpeech(spokenText, () =>
      guard.reserveProviderBudget(),
    );
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const protection = securityErrorResponse(error);
    if (protection) return protection;
    return NextResponse.json(
      {
        error:
          "The sound is unavailable. Please try again. Your question is still on screen.",
      },
      { status: 503 },
    );
  }
}
