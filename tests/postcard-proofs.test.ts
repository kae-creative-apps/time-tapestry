import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";
import { CHAPTERS } from "../src/lib/interview-state";
import { publicView } from "../src/lib/collection/access";
import { assertPostcardTextFits } from "../src/lib/collection/postcard-fit";
import {
  approvePostcardProof,
  assertReleasedPostcardProof,
  buildPostcardProof,
  postcardDeliveryReadiness,
  postcardProofIsCurrent,
  prepareAutomaticPostcards,
  releasePostcardProof,
} from "../src/lib/collection/postcard-proofs";
const origin = "https://stories.example.com";
const now = "2030-01-31T12:00:00.000Z";
function fixture(): Collection {
  return {
    schemaVersion: 2,
    id: "proof-test-collection",
    createdAt: now,
    updatedAt: now,
    status: "approved",
    autoPostcards: true,
    ownerKey: "owner-proof-key",
    recipientKey: "recipient-proof-key",
    requesterKey: "requester-proof-key",
    initiationPath: "share",
    storyteller: { name: "Narrator", email: "narrator@example.com" },
    recipient: { name: "Family", email: "family@example.com" },
    requester: { name: "Narrator", email: "narrator@example.com" },
    address: {
      name: "Family",
      line1: "1 Example Lane",
      city: "Denver",
      region: "CO",
      postalCode: "80000",
      country: "US",
    },
    addressConfirmed: true,
    invitationNote: "",
    faithFraming: "faith",
    currentQuestion: 3,
    chapterBlessings: {},
    takes: [],
    selectedTakeIds: {},
    followUps: {},
    chapters: CHAPTERS.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      content: "The full approved story stays available.",
      postcardNote: "A personal note for you.",
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    })),
    deliveries: [],
    replies: [],
    notifications: [],
    recipientViewedChapters: {},
    replyRemindersEnabled: true,
    approvedAt: now,
    approvedVersion: 1,
  };
}
function readiness(enabled: boolean) {
  process.env.COLLECTION_DELIVERY_ENABLED = enabled ? "true" : "false";
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.LOB_API_KEY = "test-only-no-provider-call";
  process.env.LOB_FROM_ADDRESS_ID = "test-only";
  process.env.LOB_WEBHOOK_SECRET = "test-only";
  process.env.CRON_SECRET = "test-only";
}
before(() => readiness(false));
test("actual artwork is self-contained, print-fit checked, and quarterly dates clamp month ends", async () => {
  const proof = await buildPostcardProof(fixture(), now, origin);
  assert.deepEqual(
    proof.cards.map((card) => card.scheduledFor),
    [
      now,
      "2030-04-30T12:00:00.000Z",
      "2030-07-31T12:00:00.000Z",
      "2030-10-31T12:00:00.000Z",
    ],
  );
  assert.match(proof.cards[0].front, /data:image\/png;base64/);
  assert.match(proof.cards[0].front, /data:font\/woff2;base64/);
  assert.match(proof.cards[0].back, /data:image\/png;base64/);
  assert.doesNotMatch(proof.cards[0].front, /src="https:/);
});
test("automatic approval with delivery disabled freezes a held proof and never creates mail jobs", async () => {
  readiness(false);
  const c = await prepareAutomaticPostcards(fixture(), now, origin);
  assert.equal(c.postcardProof?.releaseStatus, "held");
  assert.equal(c.postcardPreparation?.status, "waiting_for_setup");
  assert.equal(c.deliveries.length, 0);
  assert.equal(c.notifications.length, 0);
  assert.throws(() => assertReleasedPostcardProof(c, origin), /hold/);
});
test("the public Lob debugger secret cannot release postcards even when all other settings are ready", async () => {
  readiness(true);
  process.env.LOB_WEBHOOK_SECRET = "secret";
  try {
    assert.deepEqual(postcardDeliveryReadiness(origin), {
      ready: false,
      reasons: ["Mailing confirmation is not configured."],
    });
    const c = await prepareAutomaticPostcards(fixture(), now, origin);
    assert.equal(c.postcardPreparation?.status, "waiting_for_setup");
    assert.equal(c.postcardProof?.releaseStatus, "held");
    assert.deepEqual(c.deliveries, []);
    assert.throws(
      () => releasePostcardProof(c, c.postcardProof!.hash, now, origin),
      /Mailing confirmation is not configured/,
    );
    process.env.LOB_WEBHOOK_SECRET = "synthetic-private-signing-secret";
    assert.equal(postcardDeliveryReadiness(origin).ready, true);
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardProof?.releaseStatus, "released");
    assert.equal(c.deliveries.length, 4);
  } finally {
    readiness(false);
  }
});
test("legacy digital approval with a saved address does not opt into postcards", async () => {
  readiness(true);
  const c = fixture();
  delete c.autoPostcards;
  await prepareAutomaticPostcards(c, now, origin);
  assert.equal(c.postcardProof, undefined);
  assert.deepEqual(c.deliveries, []);
  readiness(false);
});
test("ready automatic setup releases exactly four saved dates and is idempotent", async () => {
  readiness(true);
  const c = await prepareAutomaticPostcards(fixture(), now, origin);
  assert.equal(c.postcardProof?.releaseStatus, "released");
  assert.equal(c.deliveries.length, 4);
  assert.equal(
    assertReleasedPostcardProof(c, origin).hash,
    c.postcardProof?.hash,
  );
  const snapshot = JSON.stringify(c.postcardProof);
  await prepareAutomaticPostcards(c, "2030-02-01T12:00:00.000Z", origin);
  assert.equal(JSON.stringify(c.postcardProof), snapshot);
  assert.equal(c.postcardProofHistory?.length || 0, 0);
  readiness(false);
});
test("address edits invalidate a saved proof, and safe re-preparation retains the immutable prior version", async () => {
  readiness(false);
  const c = await prepareAutomaticPostcards(fixture(), now, origin);
  const prior = structuredClone(c.postcardProof!);
  c.address!.line1 = "2 Changed Lane";
  assert.equal(postcardProofIsCurrent(c, c.postcardProof, origin), false);
  await prepareAutomaticPostcards(c, now, origin);
  assert.deepEqual(c.postcardProofHistory?.[0], prior);
  assert.equal(c.postcardProof?.address.line1, "2 Changed Lane");
  assert.notEqual(c.postcardProof?.hash, prior.hash);
});
test("tampered artwork, notes, and stale approval hashes cannot pass release", async () => {
  const c = fixture();
  const proof = await buildPostcardProof(c, now, origin);
  assert.throws(
    () => approvePostcardProof(c, proof, "old-hash", now),
    /changed/,
  );
  approvePostcardProof(c, proof, proof.hash, now);
  c.postcardProof!.cards[0].front += "changed";
  assert.equal(postcardProofIsCurrent(c, c.postcardProof, origin), false);
  assert.throws(
    () => releasePostcardProof(c, proof.hash, now, origin),
    /current/,
  );
});
test("started mailings cannot be replaced automatically after an address change", async () => {
  readiness(true);
  const c = await prepareAutomaticPostcards(fixture(), now, origin);
  c.deliveries[0].providerId = "fixture-provider-id";
  c.deliveries[0].status = "submitted";
  const proofHash = c.postcardProof!.hash;
  c.address!.line1 = "A different address";
  await prepareAutomaticPostcards(c, now, origin);
  assert.equal(c.postcardPreparation?.status, "needs_attention");
  assert.equal(c.postcardProof!.hash, proofHash);
  assert.equal(c.deliveries[0].providerId, "fixture-provider-id");
  readiness(false);
});
test("missing addresses remain pending and the scheduling error asks for the address", async () => {
  const c = fixture();
  c.addressConfirmed = false;
  delete c.address;
  await prepareAutomaticPostcards(c, now, origin);
  assert.equal(c.postcardPreparation?.status, "waiting_for_address");
  assert.equal(c.postcardProof, undefined);
  assert.throws(
    () => releasePostcardProof(c, "missing", now, origin),
    /address/,
  );
});
test("proof payloads and archived private addresses are excluded from recipient and requester views", async () => {
  const c = await prepareAutomaticPostcards(fixture(), now, origin);
  c.postcardProofHistory = [structuredClone(c.postcardProof!)];
  for (const role of ["recipient", "requester"] as const) {
    const view = publicView(c, role);
    assert.equal(view.postcardProof, undefined);
    assert.equal(view.postcardProofHistory, undefined);
    assert.equal(view.postcardPreparation, undefined);
  }
});
test("long postcard text, names and unsupported glyphs are held instead of clipped", async () => {
  for (const field of [
    "note",
    "name",
    "title",
    "scripture",
    "glyph",
  ] as const) {
    const c = fixture();
    if (field === "note") c.chapters[0].postcardNote = "W".repeat(900);
    if (field === "name") c.storyteller.name = "W".repeat(120);
    if (field === "title") c.chapters[0].title = "W".repeat(120);
    if (field === "scripture")
      c.chapterBlessings.q1 = {
        encouragement: "",
        scriptureText: "W".repeat(800),
        scriptureReference: "",
        scriptureTranslation: "",
      };
    if (field === "glyph") c.chapters[0].postcardNote = "A personal note 😀";
    assert.throws(() => assertPostcardTextFits(c, "q1"), /print|postcard/);
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "needs_attention");
    assert.equal(c.postcardProof, undefined);
    assert.equal(c.deliveries.length, 0);
  }
});
test("proof endpoint rejects recipient access and stale preview approval without sending", async () => {
  readiness(false);
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.VERCEL;
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "tt-proof-tests-"),
  );
  const store = await import("../src/lib/collection/store");
  const route =
    await import("../src/app/api/collection/[id]/postcard-proof/route");
  const c = fixture();
  await store.putCollection(c);
  const context = { params: Promise.resolve({ id: c.id }) };
  const base = `http://localhost/api/collection/${c.id}/postcard-proof?key=`;
  assert.equal(
    (await route.GET(new NextRequest(base + c.recipientKey), context)).status,
    403,
  );
  const get = await route.GET(new NextRequest(base + c.ownerKey), context);
  assert.equal(get.status, 200);
  const response = await route.POST(
    new NextRequest(base + c.ownerKey, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        firstMailingAt: now,
        proofHash: "stale",
        reviewed: true,
      }),
    }),
    context,
  );
  assert.equal(response.status, 409);
  assert.deepEqual((await store.getCollection(c.id))!.deliveries, []);
});
