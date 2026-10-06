import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readAccountVerification,
  finishAccountVerification,
} from "../src/lib/accounts/verification-client";

test("verification requests keep tokens out of URLs and accept only keyless collection returns", async (t) => {
  let destination: unknown = "/collection/recipient-collection/chapter/q3";
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(url.includes("private-token"), false);
      assert.equal(options.cache, "no-store");
      if (url === "/api/account/verification") {
        assert.equal(
          new Headers(options.headers).get("X-Account-Verification"),
          "private-token",
        );
        return Response.json({
          emailHint: "r***@example.test",
          expiresAt: "2030-01-01T00:00:00.000Z",
          canConfirm: true,
        });
      }
      assert.equal(url, "/api/account/verify");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(String(options.body)), {
        token: "private-token",
      });
      return Response.json({ nextUrl: destination });
    },
  );
  assert.equal(
    (await readAccountVerification("private-token")).canConfirm,
    true,
  );
  assert.equal(await finishAccountVerification("private-token"), destination);
  for (destination of [
    "https://outside.test",
    "//outside.test",
    "/record/private-id?key=secret",
    "/collection/recipient-collection?key=secret",
    "/collection/recipient-collection/chapter/q5",
    {},
    null,
  ])
    assert.equal(await finishAccountVerification("private-token"), "/account");
});

test("stalled verification checks and confirmations stop waiting so the page can recover", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let aborted = 0;
  t.mock.method(
    globalThis,
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          aborted++;
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  const checking = assert.rejects(
    readAccountVerification("private-token"),
    /taking longer/,
  );
  t.mock.timers.tick(20000);
  await checking;
  const confirming = assert.rejects(
    finishAccountVerification("private-token"),
    /may already be saved/,
  );
  t.mock.timers.tick(20000);
  await confirming;
  assert.equal(aborted, 2);
});

test("unavailable verification returns a readable retry error, without treating it as successful sign-in", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Gateway down</html>", { status: 502 }),
  );
  await assert.rejects(
    readAccountVerification("private-token"),
    /could not reach/,
  );
  await assert.rejects(
    finishAccountVerification("private-token"),
    /could not reach/,
  );
});
