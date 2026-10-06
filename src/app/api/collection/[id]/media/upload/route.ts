import { guardRequest } from "@/lib/security/request";
import { readJsonBody, securityErrorResponse } from "@/lib/security/http";
import { reserveMediaUpload } from "@/lib/collection/usage";
import { finalizeCloudMedia } from "@/lib/collection/media";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCollection, getMedia, mutateRecord } from "@/lib/collection/store";
import { collectionAccessForRequest } from "@/lib/collection/request-access";
import { recipientById, storedRecipientId } from "@/lib/collection/recipients";
import { mediaTypes } from "@/lib/collection/media";
import { isGeneratedFilmMedia } from "@/lib/collection/recording-validation";
import { assertLivingStoryUpload } from "@/lib/collection/living-story";
import type { Collection, StoredMedia } from "@/lib/collection/types";
import {
  PipelineInputError,
  pipelineContext,
  pipelineFailure,
  withPipelineStage,
} from "@/lib/observability/pipeline-logger";

function uploadMomentId(c: Collection, role: string, value: unknown) {
  if (role === "owner" && c.status === "approved") {
    if (typeof value !== "string" || !value)
      throw new PipelineInputError(
        "Choose a draft memory before uploading a recording.",
      );
    assertLivingStoryUpload(c, value);
    return value;
  }
  if (value !== undefined)
    throw new PipelineInputError(
      "Additional recordings require an approved gift and its owner.",
    );
  return undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let trace = pipelineContext();
  try {
    const { id } = await params;
    trace = pipelineContext(id);
    const body = (await readJsonBody(req)) as unknown as HandleUploadBody;
    const result = await withPipelineStage(
      "RECORDING_UPLOAD",
      trace,
      () =>
        handleUpload({
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
              (role === "recipient" && c.status !== "approved")
            )
              throw new PipelineInputError("Upload access denied");
            await guardRequest(req, { action: "upload", resourceId: id });
            const p = JSON.parse(payload || "{}");
            const momentId = uploadMomentId(c, role, p.momentId);
            if (
              !/^[a-zA-Z0-9_-]{8,80}$/.test(p.mediaId) ||
              pathname !== `collections/${id}/${p.mediaId}` ||
              !mediaTypes.includes((p.mimeType || "").split(";")[0])
            )
              throw new PipelineInputError("Invalid upload");
            const assertExisting = (existing: StoredMedia | null) => {
              if (isGeneratedFilmMedia(existing ?? { id: p.mediaId }, c))
                throw new PipelineInputError(
                  "Completed films cannot be used for recording uploads.",
                );
              if (
                existing &&
                (existing.collectionId !== id ||
                  existing.role !== role ||
                  existing.livingStoryMomentId !== momentId ||
                  (role === "recipient" &&
                    storedRecipientId(existing) !== access?.recipientId))
              )
                throw new PipelineInputError("Invalid recording");
            };
            assertExisting(await getMedia(p.mediaId));
            await reserveMediaUpload({
              collectionId: id,
              mediaId: p.mediaId,
              bytes: p.bytes,
            });
            await mutateRecord<StoredMedia>(
              `media-${p.mediaId}`,
              (existing) => {
                // A concurrent token request must never rebind an existing recording.
                assertExisting(existing);
                if (existing) return existing;
                return {
                  provenance: "uploaded_recording",
                  id: p.mediaId,
                  collectionId: id,
                  role,
                  ...(momentId ? { livingStoryMomentId: momentId } : {}),
                  ...(role === "recipient"
                    ? { recipientId: access!.recipientId }
                    : {}),
                  mimeType: p.mimeType.split(";")[0],
                  originalName: String(p.name || "recording").slice(0, 200),
                  bytes: 0,
                  createdAt: new Date().toISOString(),
                };
              },
            );
            return {
              allowedContentTypes: mediaTypes,
              maximumSizeInBytes: p.bytes,
              validUntil: Date.now() + 15 * 60 * 1000,
              addRandomSuffix: false,
              allowOverwrite: false,
              tokenPayload: JSON.stringify({
                id: p.mediaId,
                collectionId: id,
                ...(momentId ? { momentId } : {}),
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
              !c ||
              m.collectionId !== id ||
              m.collectionId !== p.collectionId ||
              (m.role === "recipient" &&
                (!c ||
                  c.status !== "approved" ||
                  storedRecipientId(m) !== storedRecipientId(p) ||
                  !recipientById(c, storedRecipientId(p)))) ||
              !blob.url.includes(".private.blob.vercel-storage.com/")
            )
              throw new PipelineInputError("Invalid upload completion");
            const momentId = uploadMomentId(c, m.role, p.momentId);
            if (m.livingStoryMomentId !== momentId)
              throw new PipelineInputError(
                "Invalid recording for this memory.",
              );
            // handleUpload validates the provider callback. Do not require browser Origin here.
            await finalizeCloudMedia(m.id);
          },
        }),
      "vercel_blob",
    );
    return NextResponse.json(result);
  } catch (e) {
    const protection = securityErrorResponse(e);
    if (protection) return protection;
    return NextResponse.json(pipelineFailure("RECORDING_UPLOAD", trace, e), {
      status: 400,
    });
  }
}
