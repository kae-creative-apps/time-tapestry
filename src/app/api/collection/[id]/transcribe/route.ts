import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import {
  getCollection,
  getMedia,
  putMedia,
  mutateCollection,
} from "@/lib/collection/store";
import { roleFor, requireOwner, publicView } from "@/lib/collection/access";
import { mediaBytes } from "@/lib/collection/media";
import { isStoredOwnerRecording } from "@/lib/collection/recording-validation";
import { assertOrigin } from "@/lib/security/policy";
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
    requireOwner(c, "owner");
    assertOrigin(req);
    const guard = await guardRequest(req, {
      action: "transcribe",
      resourceId: id,
    });
    const b = await readJsonBody(req);
    const m = await getMedia(
      typeof b.mediaId === "string" ? b.mediaId : "invalid-id",
    );
    if (!isStoredOwnerRecording(m, c))
      throw new Error(
        "Your original recording could not be found. Please try again.",
      );
    const take = c.takes.find((item) => item.id === b.takeId);
    if (!take || (take.mediaId !== m.id && take.audioMediaId !== m.id))
      throw new Error(
        "Save this recording to its answer before transcribing it.",
      );
    if (take.audioMediaId && take.audioMediaId !== m.id)
      throw new Error(
        "Use this recording's saved audio backup for transcription.",
      );
    if (!process.env.OPENAI_API_KEY && !m.transcription)
      return NextResponse.json(
        {
          error:
            "Transcription is unavailable right now. Your original recording is saved. Try again when the service is ready.",
        },
        { status: 503 },
      );
    let transcription = m.transcription;
    if (!transcription) {
      const bytes = await mediaBytes(m, 25 * 1024 * 1024);
      if (bytes.byteLength > 25 * 1024 * 1024)
        throw new Error(
          "This recording is too large to transcribe here. Your original is saved. Record a shorter answer to continue.",
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
      const file = await toFile(bytes, `answer.${extension}`, {
        type: m.mimeType,
      });
      await guard.reserveProviderBudget();
      const result = await client.audio.transcriptions.create({
        model: "whisper-1",
        file,
      });
      if (!result.text?.trim() || result.text.length > 30000)
        throw new Error(
          "The recording did not return a usable transcript. Replay it and try a new recording if needed.",
        );
      transcription = {
        text: result.text.trim(),
        provider: "openai" as const,
        model: "whisper-1" as const,
        completedAt: new Date().toISOString(),
      };
    }
    // Recheck the owner and immutable media binding after the provider finishes.
    // A retry reuses the saved provider result rather than replacing its words.
    const next = await mutateCollection(id, async (current) => {
      requireOwner(
        current,
        roleFor(current, req.nextUrl.searchParams.get("key") || ""),
      );
      const target = current.takes.find((item) => item.id === take.id);
      const currentMedia = await getMedia(m.id);
      if (
        !target ||
        !isStoredOwnerRecording(currentMedia, current) ||
        (target.mediaId !== m.id && target.audioMediaId !== m.id) ||
        (target.audioMediaId && target.audioMediaId !== m.id)
      )
        throw new Error(
          "This recording changed while it was being transcribed. Reload and try again.",
        );
      const saved = currentMedia.transcription ?? transcription!;
      await putMedia({ ...currentMedia, transcription: saved });
      const changed = target.text !== saved.text;
      target.text = saved.text;
      target.transcriptionStatus = "ready";
      if (
        changed &&
        current.selectedTakeIds[target.questionId] === target.id &&
        current.chapters.length
      ) {
        current.draftOutdated = true;
        current.status = "recording";
        for (const chapter of current.chapters) {
          chapter.editorialReviewed = false;
          chapter.reviewedFilmSha256 = undefined;
        }
      }
      return current;
    });
    return NextResponse.json(
      {
        text: next.takes.find((item) => item.id === take.id)!.text,
        collection: publicView(next, "owner"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const protection = securityErrorResponse(e);
    if (protection) return protection;
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "We could not transcribe this recording. Your original is saved. Please try again.",
      },
      { status: 400 },
    );
  }
}
