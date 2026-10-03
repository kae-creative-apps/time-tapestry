import { NextResponse } from "next/server";
import { SecurityError } from "./policy";
export function securityErrorResponse(error: unknown) {
  if (!(error instanceof SecurityError)) return null;
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...(error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    },
  );
}
/** Bound actual bytes, not just Content-Length, before parsing or verifying a signature. */
export async function readRawBody(
  req: Request,
  maxBytes = 64 * 1024,
  tooLargeMessage = "These details are too large to save in one request.",
): Promise<Buffer> {
  if (Number(req.headers.get("content-length") || 0) > maxBytes) {
    await req.body?.cancel().catch(() => {});
    throw new SecurityError(tooLargeMessage, 413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new SecurityError("Please provide valid details.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new SecurityError(tooLargeMessage, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}
export async function readJsonBody(
  req: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const body = await readRawBody(req, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(body.toString("utf8"));
  } catch {
    throw new SecurityError("Please provide valid details.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SecurityError("Please provide valid details.", 400);
  return value as Record<string, unknown>;
}

/** Bound the stream itself, including multipart requests with absent or false Content-Length. */
export async function readFormBody(
  req: Request,
  maxBytes: number,
): Promise<FormData> {
  if (Number(req.headers.get("content-length") || 0) > maxBytes)
    throw new SecurityError("This recording exceeds the upload limit.", 413);
  if (!req.body) throw new SecurityError("Choose a recording.", 400);
  let bytes = 0;
  const limited = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes)
          throw new SecurityError(
            "This recording exceeds the upload limit. Your original stays on this device.",
            413,
          );
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(limited, {
    headers: { "Content-Type": req.headers.get("content-type") || "" },
  }).formData();
}
