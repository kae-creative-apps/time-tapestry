import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getCollection, getMedia } from "@/lib/collection/store";
import { roleFor } from "@/lib/collection/access";
import { mediaAllowed } from "@/lib/collection/media";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  try {
    const { id, mediaId } = await params;
    const c = await getCollection(id),
      m = await getMedia(mediaId);
    const role = c && roleFor(c, req.nextUrl.searchParams.get("key") || "");
    if (!c || !m || !role || !mediaAllowed(c, role, m))
      return new NextResponse("Recording not found", { status: 404 });
    const range = req.headers.get("range");
    const headers: Record<string, string> = {
      "Content-Type": m.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Accept-Ranges": "bytes",
    };
    if (m.url) {
      const upstream = await fetch(m.url, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          ...(range ? { Range: range } : {}),
        },
        cache: "no-store",
      });
      if (!upstream.ok)
        return new NextResponse("Recording unavailable", {
          status: upstream.status,
        });
      for (const key of ["content-length", "content-range"]) {
        const value = upstream.headers.get(key);
        if (value) headers[key] = value;
      }
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers,
      });
    }
    if (!m.localPath) throw new Error("Missing media");
    const { size } = await stat(m.localPath);
    let start = 0,
      end = size - 1,
      status = 200;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new NextResponse(null, { status: 416 });
      start = Number(match[1]);
      end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
      if (start > end || start >= size)
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    const stream = Readable.toWeb(
      createReadStream(m.localPath, { start, end }),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, { status, headers });
  } catch {
    return new NextResponse("Recording unavailable", { status: 503 });
  }
}
