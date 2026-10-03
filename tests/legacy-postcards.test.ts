import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "../src/lib/admin-auth";

test("retired postcard sender remains admin protected and cannot dispatch with a live key configured", async (t) => {
  const settings = {
    ADMIN_SECRET: "synthetic-admin-secret",
    LOB_API_KEY: "live_synthetic_never_sent",
    LOB_FROM_ADDRESS_ID: "adr_synthetic_never_sent",
    COLLECTION_DELIVERY_ENABLED: "false",
    COLLECTION_EMAIL_ENABLED: "false",
  };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("A retired postcard route must never reach a provider.");
  });
  // Import after configuration to catch the old SDK's module-level key setup.
  const { POST } = await import("../src/app/api/postcards/send/route");
  for (const authenticated of [false, true]) {
    const request = new NextRequest("http://localhost/api/postcards/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authenticated
          ? { cookie: `admin_token=${createAdminSession()}` }
          : {}),
      },
      body: "not-json",
    });
    const response = await POST(request);
    assert.equal(response.status, authenticated ? 410 : 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      request.bodyUsed,
      false,
      "Retirement must precede input parsing.",
    );
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload), ["error"]);
    assert.match(
      payload.error,
      authenticated ? /approved postcard workflow/ : /admin access/,
    );
  }
  assert.equal(calls, 0);
});
