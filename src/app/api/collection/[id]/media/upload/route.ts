import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCollection, getMedia, putMedia } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { mediaTypes } from "@/lib/collection/media";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        const c = await getCollection(id);
        const role = c && roleFor(c, req.nextUrl.searchParams.get("key") || "");
        if (
          !c ||
          !role ||
          role === "requester" ||
          (role === "owner" && c.status === "approved") ||
          (role === "recipient" && c.status !== "approved")
        )
          throw new Error("Upload access denied");
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
          maximumSizeInBytes: 512 * 1024 * 1024,
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
        await putMedia({ ...m, url: blob.url, mimeType: blob.contentType });
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}
