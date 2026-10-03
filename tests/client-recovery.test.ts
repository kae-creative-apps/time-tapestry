import test from "node:test";
import assert from "node:assert/strict";
import { collectionRequest } from "../src/lib/collection/client-request";
import {
  readStartDraft,
  startDraftLifetime,
  type StartDraft,
} from "../src/lib/collection/start-draft";

const draft: StartDraft = {
  version: 1,
  expiresAt: 1000 + startDraftLifetime,
  step: 2,
  me: { name: "Evelyn Example", email: "evelyn@example.test" },
  other: { name: "Sam Example", email: "sam@example.test" },
  recipient: { name: "", email: "" },
  recipientIsMe: true,
  addressLater: true,
  address: {
    name: "",
    line1: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  },
  note: "A fictional memory",
  submission: {
    id: "16aef091-0bc5-4d2d-a757-273ebd5d2098",
    fingerprint: "synthetic unchanged request",
  },
};

test("setup recovery preserves a private retry ID but never restores consent or verification", () => {
  const recovered = readStartDraft(
    JSON.stringify({ ...draft, consent: true, humanToken: "do-not-restore" }),
    1000,
  );
  assert.equal(recovered?.step, 2);
  assert.deepEqual(recovered?.submission, draft.submission);
  assert.equal("consent" in recovered!, false);
  assert.equal("humanToken" in recovered!, false);
  assert.equal(readStartDraft(JSON.stringify(draft), draft.expiresAt), null);
  assert.equal(
    readStartDraft(JSON.stringify({ ...draft, step: 4 }), 1000),
    null,
  );
  assert.equal(
    readStartDraft(
      JSON.stringify({ ...draft, me: { name: {}, email: "a@b.test" } }),
      1000,
    ),
    null,
  );
});

test("a stalled write stops waiting and warns that the operation may have saved", async (t) => {
  let aborted = false;
  t.mock.method(
    globalThis,
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
  await assert.rejects(
    collectionRequest("/fictional", { method: "POST" }, 10),
    /may already be saved/,
  );
  assert.equal(aborted, true);
});

test("HTML gateway failures are readable and a cancelled page retains its abort reason", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<h1>Gateway unavailable</h1>", { status: 502 }),
  );
  await assert.rejects(
    collectionRequest("/fictional"),
    /could not reach your stories/,
  );
  t.mock.restoreAll();
  const controller = new AbortController();
  controller.abort(new DOMException("Leaving page", "AbortError"));
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      options.signal?.throwIfAborted();
      return Response.json({});
    },
  );
  await assert.rejects(
    collectionRequest("/fictional", { signal: controller.signal }),
    /Leaving page/,
  );
});
