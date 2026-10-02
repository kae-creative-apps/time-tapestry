import { withLegacyAdmin } from "@/lib/legacy-access";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession, updateSession } from "@/lib/session";

async function legacyPOST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // deliberate: 50MB cap prevents runaway uploads while fitting long recordings
        return {
          allowedContentTypes: ["video/webm", "video/mp4", "video/quicktime"],
          maximumSizeInBytes: 50 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = tokenPayload
          ? (JSON.parse(tokenPayload) as { sessionId?: string })
          : null;
        const sessionId = payload?.sessionId;
        if (!sessionId) return;

        const session = await getSession(sessionId);
        if (!session) return;

        await updateSession(sessionId, (s) => ({ ...s, videoUrl: blob.url }));
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("[video/upload-url] error:", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}

export const POST = withLegacyAdmin(legacyPOST);
