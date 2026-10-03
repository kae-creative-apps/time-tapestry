import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";
import { PUBLIC_POSTCARD_DEFAULTS } from "../src/lib/collection/postcard-public-message";

test("public print approval requires exact reviewed copy and explicit consent, with no provider calls", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tt-public-print-"));
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
    throw new Error("This test must never contact a provider");
  });
  const store = await import("../src/lib/collection/store");
  const route =
    await import("../src/app/api/collection/[id]/postcard-proof/route");
  const { postcardPublicMessagesHash, postcardProofIsCurrent } =
    await import("../src/lib/collection/postcard-proofs");
  const c: Collection = {
    schemaVersion: 2,
    id: "public-print-fixture",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "approved",
    autoPostcards: true,
    ownerKey: "fixture-owner",
    recipientKey: "fixture-recipient",
    requesterKey: "fixture-requester",
    initiationPath: "share",
    storyteller: { name: "Evelyn", email: "evelyn@example.invalid" },
    recipient: { name: "Anna", email: "anna@example.invalid" },
    requester: { name: "Evelyn", email: "evelyn@example.invalid" },
    address: {
      name: "Anna Example",
      line1: "1 Example Road",
      city: "Denver",
      region: "CO",
      postalCode: "80000",
      country: "US",
    },
    addressConfirmed: true,
    invitationNote: "",
    faithFraming: "faith",
    currentQuestion: 3,
    chapterBlessings: {
      q1: {
        encouragement: "Private family difficulty",
        scriptureText: "",
        scriptureReference: "",
        scriptureTranslation: "",
      },
    },
    takes: [],
    selectedTakeIds: {},
    followUps: {},
    chapters: ["q1", "q2", "q3", "q4"].map((id) => ({
      id,
      title: "Private family story",
      content: "Private donation amount",
      postcardNote: "Private medical history",
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    })),
    approvedVersion: 1,
    deliveries: [],
    replies: [],
    notifications: [],
    recipientViewedChapters: {},
    replyRemindersEnabled: false,
  };
  await store.putCollection(c);
  const context = { params: Promise.resolve({ id: c.id }) };
  const url = `http://localhost/api/collection/${c.id}/postcard-proof?key=`;
  const post = (body: unknown, key = c.ownerKey) =>
    route.POST(
      new NextRequest(url + key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      context,
    );
  const preview = async () => {
    const response = await route.GET(
      new NextRequest(url + c.ownerKey),
      context,
    );
    assert.equal(response.status, 200);
    return response.json();
  };
  let proof = (await preview()).proof;
  assert.doesNotMatch(proof.cards[0].front, /Private family|medical|donation/);
  assert.equal(
    (
      await post({
        action: "approve",
        proofHash: proof.hash,
        firstMailingAt: proof.firstMailingAt,
        reviewed: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await store.getCollection(c.id))!.postcardPublicConsent,
    undefined,
  );
  assert.equal(
    (
      await post(
        { action: "save_messages", messages: PUBLIC_POSTCARD_DEFAULTS },
        c.recipientKey,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post({
        action: "save_messages",
        messages: { q1: "Missing other cards" },
      })
    ).status,
    400,
  );
  const messages = {
    ...PUBLIC_POSTCARD_DEFAULTS,
    q1: "May you always know the difference your kindness makes.",
  };
  assert.equal((await post({ action: "save_messages", messages })).status, 200);
  assert.equal(
    (
      await post({
        action: "approve",
        proofHash: proof.hash,
        firstMailingAt: proof.firstMailingAt,
        reviewed: true,
        publicMessageApproved: true,
      })
    ).status,
    409,
  );
  proof = (await preview()).proof;
  assert.equal(
    (
      await post({
        action: "approve",
        proofHash: proof.hash,
        firstMailingAt: proof.firstMailingAt,
        reviewed: true,
        publicMessageApproved: true,
      })
    ).status,
    200,
  );
  let saved = (await store.getCollection(c.id))!;
  assert.equal(
    saved.postcardPublicConsent?.messagesHash,
    postcardPublicMessagesHash(saved),
  );
  assert.deepEqual(saved.deliveries, []);
  assert.equal(
    (
      await post({
        action: "save_messages",
        messages: { ...messages, q2: "New public wording" },
      })
    ).status,
    200,
  );
  saved = (await store.getCollection(c.id))!;
  assert.equal(saved.postcardPublicConsent, undefined);
  assert.equal(postcardProofIsCurrent(saved), false);
  saved.deliveries = [
    {
      chapterId: "q1",
      scheduledFor: new Date().toISOString(),
      status: "submitted",
      providerId: "psc_synthetic",
    },
  ];
  await store.putCollection(saved);
  assert.equal((await post({ action: "save_messages", messages })).status, 409);
  assert.equal(
    (await store.getCollection(c.id))!.deliveries[0].providerId,
    "psc_synthetic",
  );
});
