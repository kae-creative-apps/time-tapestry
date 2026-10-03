import { guardRequest } from "@/lib/security/request";
import {
  readFormBody,
  readJsonBody,
  securityErrorResponse,
} from "@/lib/security/http";
import { MAX_MEDIA_BYTES } from "@/lib/collection/usage";
import { SecurityError } from "@/lib/security/policy";
import { NextRequest, NextResponse } from "next/server";
import { getCollection, getMedia } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { saveLocalMedia, finalizeCloudMedia } from "@/lib/collection/media";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const role = c && roleFor(c, req.nextUrl.searchParams.get("key") || "");
    if (!c || !role || role === "requester")
      return NextResponse.json(
        { error: "Recording access denied" },
        { status: 403 },
      );
    if (role === "recipient" && c.status !== "approved")
      throw new Error("The gift is not ready for replies yet.");
    if (role === "owner" && c.status === "approved")
      throw new Error("Approved recordings cannot be changed.");
    await guardRequest(req, { action: "upload", resourceId: id });
    if (
      Number(req.headers.get("content-length") || 0) >
      MAX_MEDIA_BYTES + 1024 * 1024
    )
      throw new SecurityError(
        "This recording exceeds the 512 MiB upload limit.",
        413,
      );
    if (req.headers.get("content-type")?.includes("application/json")) {
      const b = await readJsonBody(req);
      const m = await getMedia(
        typeof b.mediaId === "string" ? b.mediaId : "invalid-id",
      );
      if (!m || m.collectionId !== id || m.role !== role)
        throw new Error("Recording not found");
      const saved = await finalizeCloudMedia(m.id);
      return NextResponse.json({ mediaId: saved.id });
    }
    const form = await readFormBody(req, MAX_MEDIA_BYTES + 1024 * 1024);
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a recording");
    const media = await saveLocalMedia(id, role, file);
    return NextResponse.json({ mediaId: media.id });
  } catch (e) {
    const protection = securityErrorResponse(e);
    if (protection) return protection;
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Upload failed. Your take is still on this device.",
      },
      { status: 400 },
    );
  }
}
