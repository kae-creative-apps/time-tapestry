import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { assertPrivateBlobUrl } from "@/lib/collection/media";
import { get } from "@vercel/blob";
import { getCollection, getMedia } from "@/lib/collection/store";
import {
  adminAuthorized,
  adminReadHeaders,
  auditAdminRead,
  safeLocalMediaPath,
} from "@/lib/admin-collections";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function parseRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return null;
  return { start, end };
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  try {
    if (!(await adminAuthorized(req)))
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: adminReadHeaders,
      });
    const { id, mediaId } = await params;
    if (![id, mediaId].every((value) => /^[a-zA-Z0-9_-]{8,80}$/.test(value)))
      return new NextResponse("Recording not found", {
        status: 404,
        headers: adminReadHeaders,
      });
    const [c, media] = await Promise.all([
      getCollection(id),
      getMedia(mediaId),
    ]);
    if (!c || !media || media.collectionId !== id)
      return new NextResponse("Recording not found", {
        status: 404,
        headers: adminReadHeaders,
      });
    const download = req.nextUrl.searchParams.get("download") === "1";
    const filename =
      (media.originalName || `recording-${media.id}`)
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .slice(0, 120) || "recording";
    const headers: Record<string, string> = {
      ...adminReadHeaders,
      "Content-Type": /^(audio|video)\/[\w.+-]+$/.test(media.mimeType)
        ? media.mimeType
        : "application/octet-stream",
      "Accept-Ranges": "bytes",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${filename}"` }
        : {}),
    };
    const range = req.headers.get("range");
    await auditAdminRead(req, download ? "download" : "media", id, mediaId);
    if (media.localPath) {
      const location = await safeLocalMediaPath(media.localPath),
        { size } = await stat(location);
      const partial = range ? parseRange(range, size) : null;
      if (range && !partial)
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      if (!size)
        return new NextResponse(null, {
          headers: { ...headers, "Content-Length": "0" },
        });
      const start = partial?.start ?? 0,
        end = partial?.end ?? size - 1;
      headers["Content-Length"] = String(end - start + 1);
      if (partial) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      return new NextResponse(
        Readable.toWeb(
          createReadStream(location, { start, end }),
        ) as ReadableStream<Uint8Array>,
        { status: partial ? 206 : 200, headers },
      );
    }
    if (!media.url)
      return new NextResponse("Recording is not finished uploading", {
        status: 409,
        headers,
      });
    assertPrivateBlobUrl(media.url);
    if (range && !parseRange(range, media.bytes))
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${media.bytes}` },
      });
    const result = await get(media.url, {
      access: "private",
      useCache: false,
      headers: range ? { Range: range } : {},
      abortSignal: req.signal,
    });
    if (!result || result.statusCode !== 200)
      return new NextResponse("Recording unavailable", {
        status: 404,
        headers,
      });
    for (const name of ["content-length", "content-range"]) {
      const value = result.headers.get(name);
      if (value) headers[name] = value;
    }
    return new NextResponse(result.stream, {
      status: result.headers.has("content-range") ? 206 : 200,
      headers,
    });
  } catch {
    return new NextResponse("Recording unavailable", {
      status: 503,
      headers: adminReadHeaders,
    });
  }
}
