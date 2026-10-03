import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { getCollection, getMedia } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { mediaBytes } from "@/lib/collection/media";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    if (!c || roleFor(c, req.nextUrl.searchParams.get("key") || "") !== "owner")
      return NextResponse.json(
        { error: "Open your interview link to continue." },
        { status: 403 },
      );
    if (!process.env.OPENAI_API_KEY)
      return NextResponse.json(
        {
          error:
            "We cannot turn recordings into text right now. You can type or paste the words from your recording below.",
        },
        { status: 503 },
      );
    const b = await req.json();
    const m = await getMedia(b.mediaId);
    if (!m || m.collectionId !== id || m.role !== "owner")
      throw new Error("Your recording could not be found. Please try again.");
    const bytes = await mediaBytes(m);
    if (bytes.byteLength > 25 * 1024 * 1024)
      throw new Error(
        "This recording is too large to turn into text here. Your original is saved. Type or paste its words below to continue.",
      );
    const extension = m.mimeType.includes("mp4")
      ? "mp4"
      : m.mimeType.includes("ogg")
        ? "ogg"
        : m.mimeType.includes("mpeg")
          ? "mp3"
          : m.mimeType.includes("wav")
            ? "wav"
            : "webm";
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: await toFile(bytes, `answer.${extension}`, { type: m.mimeType }),
    });
    return NextResponse.json(
      { text: result.text },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "We could not turn this recording into text. Please try again, or type or paste its words below.",
      },
      { status: 400 },
    );
  }
}
