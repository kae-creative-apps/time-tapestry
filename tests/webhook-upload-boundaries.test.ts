import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as webhook } from "../src/app/api/collection/webhooks/lob/route";
import { POST as legacyUpload } from "../src/app/api/video/upload/route";
import { POST as legacyUploadToken } from "../src/app/api/video/upload-url/route";
import { createAdminSession } from "../src/lib/admin-auth";

const secret = "synthetic-webhook-signing-key";
function headers() {
  return {
    "lob-signature": "a".repeat(64),
    "lob-signature-timestamp": String(Date.now()),
  };
}
function streamingRequest(extraHeaders: Record<string, string>) {
  let reads = 0,
    cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(128 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const req = new NextRequest("http://localhost/api/collection/webhooks/lob", {
    method: "POST",
    body,
    duplex: "half",
    headers: extraHeaders,
  } as ConstructorParameters<typeof NextRequest>[1]);
  return { req, reads: () => reads, cancelled: () => cancelled };
}

test("Lob rejects missing or malformed authentication headers before reading the stream", async () => {
  process.env.LOB_WEBHOOK_SECRET = secret;
  for (const input of [
    {},
    { ...headers(), "lob-signature": "invalid" },
    { ...headers(), "lob-signature-timestamp": "invalid" },
    { ...headers(), "lob-signature-timestamp": String(Date.now() - 600_000) },
  ]) {
    const request = streamingRequest(input);
    const response = await webhook(request.req);
    assert.equal(response.status, 401);
    assert.equal(request.reads(), 0);
    assert.equal(request.cancelled(), true);
  }
});

test("Lob cancels oversized streams with absent or understated Content-Length", async () => {
  process.env.LOB_WEBHOOK_SECRET = secret;
  for (const length of [undefined, "1"]) {
    const request = streamingRequest({
      ...headers(),
      ...(length ? { "content-length": length } : {}),
    });
    const response = await webhook(request.req);
    assert.equal(response.status, 413);
    assert.equal(request.cancelled(), true);
    assert.equal(request.reads(), 9, "Stops on the first chunk beyond 1 MiB");
  }
  const declared = streamingRequest({
    ...headers(),
    "content-length": String(2 * 1024 * 1024),
  });
  assert.equal((await webhook(declared.req)).status, 413);
  assert.equal(declared.reads(), 0);
  assert.equal(declared.cancelled(), true);
});

test("bounded raw reading preserves the exact body used by Lob signature verification", async () => {
  process.env.LOB_WEBHOOK_SECRET = secret;
  const body = '{ "fixture": "synthetic ✓" }';
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(timestamp + "." + body)
    .digest("hex");
  const response = await webhook(
    new NextRequest("http://localhost/api/collection/webhooks/lob", {
      method: "POST",
      body,
      headers: {
        "lob-signature": signature,
        "lob-signature-timestamp": timestamp,
      },
    }),
  );
  assert.equal(
    response.status,
    400,
    "A valid signature reaches event schema validation",
  );
  assert.equal((await response.json()).error, "Invalid postcard event.");
});

test("Lob verifies raw bytes before decoding text", async () => {
  process.env.LOB_WEBHOOK_SECRET = secret;
  const body = new Uint8Array([255, 254]);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(body)
    .digest("hex");
  const response = await webhook(
    new NextRequest("http://localhost/api/collection/webhooks/lob", {
      method: "POST",
      body,
      headers: {
        "lob-signature": signature,
        "lob-signature-timestamp": timestamp,
      },
    }),
  );
  assert.equal(
    response.status,
    400,
    "Valid raw signature reaches JSON validation, not 401",
  );
});

test("both legacy upload routes remain admin protected and issue no upload tokens or recordings", async (t) => {
  process.env.ADMIN_SECRET = "synthetic-admin-secret";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("No remote upload is allowed");
  });
  for (const handler of [legacyUpload, legacyUploadToken])
    for (const authenticated of [false, true]) {
      const request = streamingRequest(
        authenticated ? { cookie: `admin_token=${createAdminSession()}` } : {},
      );
      const response = await handler(request.req);
      assert.equal(response.status, authenticated ? 410 : 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(request.reads(), 0);
      const payload = await response.json();
      assert.deepEqual(Object.keys(payload), ["error"]);
      assert.match(payload.error, /private collection|current collection/);
      await request.req.body?.cancel();
    }
  assert.equal(calls, 0);
});
