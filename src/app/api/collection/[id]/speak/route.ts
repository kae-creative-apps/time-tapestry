import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { streamTextToSpeech } from "@/lib/elevenlabs-client";
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
    const b = await req.json();
    if (typeof b.text !== "string" || b.text.length > 1200)
      throw new Error("Question is too long");
    const stream = await streamTextToSpeech(b.text);
    if (!stream)
      return NextResponse.json(
        {
          error:
            "ElevenLabs voice is not configured. You can read the question or choose browser speech.",
        },
        { status: 503 },
      );
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The interview voice is unavailable. Your question is still on screen.",
      },
      { status: 503 },
    );
  }
}
