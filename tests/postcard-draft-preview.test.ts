import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { syntheticFilmCollection } from "./film-fixture";
import { PUBLIC_POSTCARD_DEFAULTS } from "../src/lib/collection/postcard-public-message";

test("owners can save and preview encouragement before private approval, but preview cannot authorize mailing", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tt-draft-cards-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://stories.example.com",
    COLLECTION_DELIVERY_ENABLED: "false",
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Draft preview cannot contact a provider");
  });
  const store = await import("../src/lib/collection/store");
  const route =
    await import("../src/app/api/collection/[id]/postcard-proof/route");
  const collection = syntheticFilmCollection();
  collection.chapters.forEach((chapter) => {
    chapter.editorialReviewed = false;
  });
  await store.putCollection(collection);
  const context = { params: Promise.resolve({ id: collection.id }) };
  const endpoint = `http://localhost/api/collection/${collection.id}/postcard-proof?key=`;
  const post = (body: unknown, key = collection.ownerKey) =>
    route.POST(
      new NextRequest(endpoint + key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      context,
    );
  const messages = {
    ...PUBLIC_POSTCARD_DEFAULTS,
    q1: "I hope you always know how loved you are.",
  };
  assert.equal(
    (await post({ action: "save_messages", messages }, collection.recipientKey))
      .status,
    403,
  );
  assert.equal((await post({ action: "save_messages", messages })).status, 200);
  const previewResponse = await route.GET(
    new NextRequest(endpoint + collection.ownerKey),
    context,
  );
  assert.equal(previewResponse.status, 200);
  assert.equal(
    previewResponse.headers.get("Cache-Control"),
    "private, no-store",
  );
  const preview = await previewResponse.json();
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.proof.cards.length, 4);
  assert.match(preview.proof.hash, /^preview:/);
  assert.match(
    preview.proof.cards[0].back,
    /I hope you always know how loved you are/,
  );
  const encoded = JSON.stringify(preview);
  for (const secret of [
    collection.ownerKey,
    collection.recipientKey,
    collection.requesterKey,
    collection.chapters[0].content,
  ])
    assert.equal(encoded.includes(secret), false);
  assert.equal(preview.proof.origin, "https://example.invalid");
  assert.equal(
    (
      await post({
        action: "approve",
        proofHash: preview.proof.hash,
        firstMailingAt: preview.proof.firstMailingAt,
        reviewed: true,
        publicMessageApproved: true,
      })
    ).status,
    400,
  );
  assert.equal((await store.getCollection(collection.id))?.status, "draft");
  assert.deepEqual((await store.getCollection(collection.id))?.deliveries, []);
  assert.equal(
    (await store.getCollection(collection.id))?.postcardPublicMessages?.q1,
    messages.q1,
  );
});
