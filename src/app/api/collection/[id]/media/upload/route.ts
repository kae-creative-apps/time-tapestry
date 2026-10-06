import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { reserveMediaUpload } from "@/lib/collection/usage";
import { finalizeCloudMedia } from "@/lib/collection/media";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCollection, getMedia, putMedia } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { recipientById, storedRecipientId } from "@/lib/collection/recipients";
import { mediaTypes } from "@/lib/collection/media";
import { isGeneratedFilmMedia } from "@/lib/collection/recording-validation";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await readJsonBody(req)) as unknown as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        const c = await getCollection(id);
        const access = c && (await collectionAccessForRequest(req, c));
        const role = access?.role;
        if (
          !c ||
          !role ||
          role === "requester" ||
          (role === "owner" && c.status === "approved") ||
          (role === "recipient" && c.status !== "approved")
        )
          throw new Error("Upload access denied");
        await guardRequest(req, { action: "upload", resourceId: id });
        const p = JSON.parse(payload || "{}");
        if (
          !/^[a-zA-Z0-9_-]{8,80}$/.test(p.mediaId) ||
          pathname !== `collections/${id}/${p.mediaId}` ||
          !mediaTypes.includes((p.mimeType || "").split(";")[0])
        )
          throw new Error("Invalid upload");
        const existing = await getMedia(p.mediaId);
        if (isGeneratedFilmMedia(existing ?? { id: p.mediaId }, c))
          throw new Error(
            "Completed films cannot be used for recording uploads.",
          );
        if (
          existing &&
          (existing.collectionId !== id ||
            existing.role !== role ||
            (role === "recipient" &&
              storedRecipientId(existing) !== access?.recipientId))
        )
          throw new Error("Invalid recording");
        await reserveMediaUpload({
          collectionId: id,
          mediaId: p.mediaId,
          bytes: p.bytes,
        });
        if (!existing)
          await putMedia({
            provenance: "uploaded_recording",
            id: p.mediaId,
            collectionId: id,
            role,
            ...(role === "recipient"
              ? { recipientId: access!.recipientId }
              : {}),
            mimeType: p.mimeType.split(";")[0],
            originalName: String(p.name || "recording").slice(0, 200),
            bytes: 0,
            createdAt: new Date().toISOString(),
          });
        return {
          allowedContentTypes: mediaTypes,
          maximumSizeInBytes: p.bytes,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            id: p.mediaId,
            collectionId: id,
            ...(role === "recipient"
              ? { recipientId: access!.recipientId }
              : {}),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const p = JSON.parse(tokenPayload || "{}");
        const m = await getMedia(p.id);
        const c = m && (await getCollection(m.collectionId));
        if (
          !m ||
          m.collectionId !== p.collectionId ||
          (m.role === "recipient" &&
            (!c ||
              c.status !== "approved" ||
              storedRecipientId(m) !== storedRecipientId(p) ||
              !recipientById(c, storedRecipientId(p)))) ||
          !blob.url.includes(".private.blob.vercel-storage.com/")
        )
          throw new Error("Invalid upload completion");
        // handleUpload validates the provider callback. Do not require browser Origin here.
        await finalizeCloudMedia(m.id);
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    const protection = securityErrorResponse(e);
    if (protection) return protection;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
