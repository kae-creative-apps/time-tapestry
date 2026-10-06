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
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { storedRecipientId } from "@/lib/collection/recipients";
import { saveLocalMedia, finalizeCloudMedia } from "@/lib/collection/media";
import { assertLivingStoryUpload } from "@/lib/collection/living-story";
import type { Collection } from "@/lib/collection/types";

function uploadMomentId(c: Collection, role: string, value: unknown) {
  if (role === "owner" && c.status === "approved") {
    if (typeof value !== "string" || !value)
      throw new Error("Choose a draft memory before uploading a recording.");
    assertLivingStoryUpload(c, value);
    return value;
  }
  if (value !== undefined)
    throw new Error(
      "Additional recordings require an approved gift and its owner.",
    );
  return undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const c = await getCollection(id);
    const access = c && (await collectionAccessForRequest(req, c));
    const role = access?.role;
    if (!c || !role || role === "requester")
      return NextResponse.json(
        { error: "Recording access denied" },
        { status: 403 },
      );
    if (role === "recipient" && c.status !== "approved")
      throw new Error("The gift is not ready for replies yet.");
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
      const momentId = uploadMomentId(c, role, b.momentId);
      const m = await getMedia(
        typeof b.mediaId === "string" ? b.mediaId : "invalid-id",
      );
      if (
        !m ||
        m.collectionId !== id ||
        m.role !== role ||
        m.livingStoryMomentId !== momentId ||
        (role === "recipient" && storedRecipientId(m) !== access?.recipientId)
      )
        throw new Error("Recording not found");
      const saved = await finalizeCloudMedia(m.id);
      return NextResponse.json({ mediaId: saved.id });
    }
    const form = await readFormBody(req, MAX_MEDIA_BYTES + 1024 * 1024);
    const momentId = uploadMomentId(
      c,
      role,
      form.has("momentId") ? form.get("momentId") : undefined,
    );
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a recording");
    const media = await saveLocalMedia(
      id,
      role,
      file,
      access?.recipientId,
      momentId,
    );
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
