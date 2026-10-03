import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { reserveMediaUpload } from "@/lib/collection/usage";
import { finalizeCloudMedia } from "@/lib/collection/media";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCollection, getMedia, putMedia } from "@/lib/collection/store";
import { collectionRoleForRequest } from "@/lib/collection/request-access";
import { mediaTypes } from "@/lib/collection/media";
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
        const role = c && (await collectionRoleForRequest(req, c));
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
        if (
          existing &&
          (existing.collectionId !== id || existing.role !== role)
        )
          throw new Error("Invalid recording");
        await reserveMediaUpload({
          collectionId: id,
          mediaId: p.mediaId,
          bytes: p.bytes,
        });
        if (!existing)
          await putMedia({
            id: p.mediaId,
            collectionId: id,
            role,
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
          tokenPayload: JSON.stringify({ id: p.mediaId, collectionId: id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const p = JSON.parse(tokenPayload || "{}");
        const m = await getMedia(p.id);
        if (
          !m ||
          m.collectionId !== p.collectionId ||
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
