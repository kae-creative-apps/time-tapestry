import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  emptyValues,
  formatGenerosityNotes,
  generosityNotesLimits,
  normalizeGenerosityNotesValues,
} from "../src/lib/collection/generosity-notes";
import { publicView } from "../src/lib/collection/access";
import type { Collection } from "../src/lib/collection/types";
import { syntheticFilmCollection } from "./film-fixture";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

let directory: string;
let store: typeof import("../src/lib/collection/store");
let post: typeof import("../src/app/api/collection/[id]/generosity-notes/route").POST;
let get: typeof import("../src/app/api/collection/[id]/route").GET;
const prior = { ...process.env };
const sentinel = "PRIVATE_NOTE_SENTINEL_4197";

before(async () => {
  for (const key of [
    "VERCEL",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-generosity-notes-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "http://localhost",
  });
  store = await import("../src/lib/collection/store");
  post = (await import("../src/app/api/collection/[id]/generosity-notes/route"))
    .POST;
  get = (await import("../src/app/api/collection/[id]/route")).GET;
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
  for (const key of Object.keys(process.env))
    if (!(key in prior)) delete process.env[key];
  Object.assign(process.env, prior);
});

const params = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
const request = (
  c: Collection,
  body: unknown,
  key = c.ownerKey,
  headers: Record<string, string> = {},
) =>
  new NextRequest(
    `http://localhost/api/collection/${c.id}/generosity-notes?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
  );
async function fixture(status: Collection["status"] = "draft") {
  const c = syntheticFilmCollection();
  c.status = status;
  if (status === "approved") {
    c.approvedAt = c.createdAt;
    c.approvedVersion = 1;
  }
  await store.putCollection(c);
  return c;
}

test("optional note fields stay exact and bounded, with no invented summary or amount", () => {
  const values = normalizeGenerosityNotesValues({
    peopleAndCauses: "My neighbor",
    involvement: "  I visited\nwhen I could.  ",
    impact: "I do not know what changed.",
  });
  assert.deepEqual(values, {
    ...emptyValues,
    peopleAndCauses: "My neighbor",
    involvement: "  I visited\nwhen I could.  ",
    impact: "I do not know what changed.",
  });
  assert.equal(
    formatGenerosityNotes(values),
    "People and causes: My neighbor\n\nHow I was involved:   I visited\nwhen I could.  \n\nWhat I know about the impact: I do not know what changed.",
  );
  assert.equal(formatGenerosityNotes({ ...emptyValues }), "");
  assert.equal(
    formatGenerosityNotes({ ...emptyValues, amount: "a private figure" }),
    "",
  );
  assert.deepEqual(normalizeGenerosityNotesValues({}), emptyValues);
  for (const input of [
    null,
    [],
    "notes",
    { amount: 12 },
    { meaning: null },
    { sourceTakeIds: ["injected"] },
    JSON.parse('{"__proto__":{"meaning":"injected"}}'),
  ])
    assert.throws(() => normalizeGenerosityNotesValues(input));
  for (const [key, limit] of Object.entries(generosityNotesLimits)) {
    assert.throws(() =>
      normalizeGenerosityNotesValues({ [key]: "x".repeat(limit + 1) }),
    );
    assert.equal(
      normalizeGenerosityNotesValues({ [key]: "x".repeat(limit) })[
        key as keyof typeof emptyValues
      ].length,
      limit,
    );
  }
});

test("only an owner can save notes, including on an approved collection, without changing the gift", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("No provider calls for private notes.");
  });
  const c = await fixture("approved");
  const response = await post(
    request(c, { revision: 0, values: { meaning: sentinel } }),
    params(c),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const view = (await response.json()).collection;
  assert.equal(view.privateGenerosityNotes.values.meaning, sentinel);
  assert.equal(view.privateGenerosityNotes.version, 1);
  assert.equal(view.privateGenerosityNotes.revision, 1);
  const saved = (await store.getCollection(c.id))!;
  const { privateGenerosityNotes, updatedAt, ...unchanged } = saved;
  const { updatedAt: oldTimestamp, ...original } = c;
  assert.deepEqual(unchanged, original);
  assert.ok(Number.isFinite(Date.parse(privateGenerosityNotes!.updatedAt)));
  assert.ok(Number.isFinite(Date.parse(updatedAt)));
  void oldTimestamp;

  const recipientCookie = await verifiedRecipientCookie(c.recipient.email);
  for (const [key, cookie] of [
    ["wrong-key", ""],
    [c.requesterKey, ""],
    [c.recipientKey, recipientCookie],
  ]) {
    const req = request(
      c,
      { revision: 1, values: { meaning: "unauthorized" } },
      key,
      cookie ? { cookie } : {},
    );
    const denied = await post(req, params(c));
    assert.equal(denied.status, 403);
    assert.equal(
      req.bodyUsed,
      false,
      "Authorization precedes parsing private input.",
    );
    assert.equal((await denied.text()).includes(sentinel), false);
  }
  assert.deepEqual(await store.getCollection(c.id), saved);
});

test("recipient and requester projections omit the notebook before and after approval, including GET", async () => {
  const c = await fixture();
  c.privateGenerosityNotes = {
    version: 1,
    revision: 1,
    updatedAt: c.createdAt,
    values: { ...emptyValues, amount: sentinel },
  };
  for (const status of ["draft", "approved"] as const) {
    c.status = status;
    for (const role of ["recipient", "requester"] as const) {
      const view = publicView(c, role);
      assert.equal(Object.hasOwn(view, "privateGenerosityNotes"), false);
      assert.equal(JSON.stringify(view).includes(sentinel), false);
    }
    assert.equal(
      publicView(c, "owner").privateGenerosityNotes?.values.amount,
      sentinel,
    );
    await store.putCollection(c);
    const cookie = await verifiedRecipientCookie(c.recipient.email);
    const response = await get(
      new NextRequest(`http://localhost/api/collection/${c.id}`, {
        headers: { cookie },
      }),
      params(c),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes(sentinel), false);
  }
});

test("a stale or concurrent revision cannot replace a saved notebook", async () => {
  const c = await fixture();
  const responses = await Promise.all(
    ["first", "second"].map((meaning) =>
      post(request(c, { revision: 0, values: { meaning } }), params(c)),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.privateGenerosityNotes?.revision, 1);
  const stale = await post(
    request(c, { revision: 0, values: { meaning: "old" } }),
    params(c),
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(await store.getCollection(c.id), saved);
  const clear = await post(request(c, { revision: 1, values: {} }), params(c));
  assert.equal(clear.status, 200);
  assert.deepEqual(
    (await clear.json()).collection.privateGenerosityNotes.values,
    emptyValues,
  );
});

test("malformed, oversized, injected and cross-origin saves leave the existing notebook intact", async () => {
  const c = await fixture();
  for (const body of [
    { values: {} },
    { revision: -1, values: {} },
    { revision: 0.5, values: {} },
    { revision: "0", values: {} },
    { revision: 0, values: null },
    { revision: 0, values: { amount: "x".repeat(501) } },
    { revision: 0, values: { chapters: [{ content: "injected" }] } },
    { revision: 0, values: {}, chapters: [] },
  ]) {
    const response = await post(request(c, body), params(c));
    assert.equal(response.status, 400);
  }
  const oversized = await post(
    request(c, { revision: 0, values: { meaning: "x".repeat(65536) } }),
    params(c),
  );
  assert.equal(oversized.status, 413);
  const foreign = await post(
    request(c, { revision: 0, values: {} }, c.ownerKey, {
      origin: "https://elsewhere.example",
    }),
    params(c),
  );
  assert.equal(foreign.status, 403);
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("private notes never become default story, live prompt, film, or public print inputs", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("External requests are forbidden in this test.");
  });
  const { draftChapters } = await import("../src/lib/collection/content");
  const { buildInterviewContext } =
    await import("../src/lib/collection/conversation-agent");
  const { filmChapters, collectionFilmSourceHash } =
    await import("../src/lib/collection/films/plan");
  const { originalCollectionHash } =
    await import("../src/lib/collection/films/original-plan");
  const { publicPostcardMessage } =
    await import("../src/lib/collection/postcard-public-message");
  const { postcardPublicMessagesHash } =
    await import("../src/lib/collection/postcard-proofs");
  const c = syntheticFilmCollection();
  const baseline = {
    story: await draftChapters(c),
    context: buildInterviewContext(c),
    films: filmChapters(c),
    filmHash: collectionFilmSourceHash(c),
    originalHash: originalCollectionHash(c),
    print: publicPostcardMessage(c, "q3"),
    printHash: postcardPublicMessagesHash(c),
  };
  c.privateGenerosityNotes = {
    version: 1,
    revision: 1,
    updatedAt: c.createdAt,
    values: Object.fromEntries(
      Object.keys(emptyValues).map((key) => [key, sentinel]),
    ) as typeof emptyValues,
  };
  const withNotes = {
    story: await draftChapters(c),
    context: buildInterviewContext(c),
    films: filmChapters(c),
    filmHash: collectionFilmSourceHash(c),
    originalHash: originalCollectionHash(c),
    print: publicPostcardMessage(c, "q3"),
    printHash: postcardPublicMessagesHash(c),
  };
  assert.deepEqual(withNotes, baseline);
  assert.equal(JSON.stringify(withNotes).includes(sentinel), false);
});
