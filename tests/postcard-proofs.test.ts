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
  postcardPublicMessagesHash,
  postcardProofIsCurrent,
  prepareAutomaticPostcards,
  releasePostcardProof,
} from "../src/lib/collection/postcard-proofs";
const origin = "https://stories.example.com";
const now = "2030-01-31T12:00:00.000Z";
function fixture(): Collection {
  const c: Collection = {
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
  c.postcardPublicConsent = {
    version: 2,
    messagesHash: postcardPublicMessagesHash(c),
    approvedAt: now,
  };
  return c;
}
function readiness(enabled: boolean) {
  process.env.COLLECTION_DELIVERY_ENABLED = enabled ? "true" : "false";
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.LOB_API_KEY = "live_fixture_no_provider_call";
  process.env.LOB_FROM_ADDRESS_ID = "test-only";
  process.env.LOB_WEBHOOK_SECRET = "test-only";
  process.env.CRON_SECRET = "test-only";
  process.env.RESEND_API_KEY = "test-only-no-provider-call";
  process.env.RESEND_FROM_EMAIL = "test@example.com";
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-only-site-key";
  process.env.TURNSTILE_SECRET_KEY = "test-only-secret-key";
  process.env.KV_REST_API_URL = "https://fixture.invalid";
  process.env.KV_REST_API_TOKEN = "test-only-no-provider-call";
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
  assert.match(proof.cards[0].front, /data:font\/ttf;base64/);
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
      mode: "live",
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
test("every public sign-in security dependency is required before release, even with a local test bypass", async (t) => {
  const previousBypass = {
    NODE_ENV: process.env.NODE_ENV,
    SECURITY_LOCAL_BYPASS: process.env.SECURITY_LOCAL_BYPASS,
    SECURITY_TEST_BYPASS: process.env.SECURITY_TEST_BYPASS,
  };
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Readiness must not contact a provider.");
  });
  try {
    for (const setting of [
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ]) {
      readiness(true);
      const c = fixture();
      const proof = await buildPostcardProof(c, now, origin);
      approvePostcardProof(c, proof, proof.hash, now);
      delete process.env[setting];
      assert.deepEqual(
        postcardDeliveryReadiness(origin),
        {
          mode: "live",
          ready: false,
          reasons: ["Recipient sign-in security is not configured."],
        },
        setting,
      );
      assert.throws(
        () => releasePostcardProof(c, proof.hash, now, origin),
        /Recipient sign-in security is not configured/,
        setting,
      );
      await prepareAutomaticPostcards(c, now, origin);
      assert.equal(c.postcardPreparation?.status, "waiting_for_setup", setting);
      assert.equal(c.postcardProof?.releaseStatus, "held", setting);
      assert.deepEqual(c.deliveries, [], setting);
      readiness(true);
      await prepareAutomaticPostcards(c, now, origin);
      assert.equal(c.postcardPreparation?.status, "ready", setting);
      const schedule = structuredClone(c.deliveries);
      delete process.env[setting];
      await prepareAutomaticPostcards(c, now, origin);
      assert.equal(c.postcardPreparation?.status, "waiting_for_setup", setting);
      assert.deepEqual(c.deliveries, schedule, setting);
    }
  } finally {
    readiness(false);
    for (const [key, value] of Object.entries(previousBypass)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("legacy print proofs stay held until explicit public-message review and are archived unchanged", async () => {
  readiness(true);
  try {
    const c = fixture();
    const legacy = await buildPostcardProof(c, now, origin);
    legacy.version = 1;
    delete legacy.accessPolicy;
    delete legacy.publicMessageHash;
    legacy.approvedAt = now;
    legacy.releaseStatus = "released";
    legacy.cards[0].front = "Legacy private story and bearer QR artwork";
    c.postcardProof = structuredClone(legacy);
    c.deliveries = legacy.cards.map((card) => ({
      chapterId: card.chapterId,
      scheduledFor: card.scheduledFor,
      status: "scheduled",
    }));
    delete c.postcardPublicConsent;
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "needs_attention");
    assert.deepEqual(c.postcardProof, legacy);
    assert.ok(c.deliveries.every((item) => !item.dispatch && !item.providerId));
    assert.equal(postcardProofIsCurrent(c), false);
    const reviewed = await buildPostcardProof(c, now, origin);
    assert.throws(
      () => approvePostcardProof(c, reviewed, reviewed.hash, now),
      /public postcard messages/,
    );
    c.postcardPublicConsent = {
      version: 2,
      messagesHash: postcardPublicMessagesHash(c),
      approvedAt: now,
    };
    approvePostcardProof(c, reviewed, reviewed.hash, now);
    assert.deepEqual(c.postcardProofHistory?.[0], legacy);
    assert.deepEqual(c.deliveries, []);
    releasePostcardProof(c, reviewed.hash, now, origin);
    assert.equal(c.postcardProof?.version, 2);
    assert.equal(c.postcardProof?.accessPolicy, "verified_recipient_email");
    assert.equal(c.deliveries.length, 4);
  } finally {
    readiness(false);
  }
});
test("a started legacy provider request is preserved for reconciliation rather than replaced", async () => {
  readiness(true);
  try {
    const c = fixture();
    const proof = await buildPostcardProof(c, now, origin);
    c.postcardProof = {
      ...proof,
      version: 1,
      approvedAt: now,
      releaseStatus: "released",
    };
    c.deliveries = [
      {
        chapterId: "q1",
        scheduledFor: now,
        status: "failed",
        dispatch: {
          attempts: 1,
          requestBody: "saved legacy request",
          idempotencyKey: "saved-legacy-key",
        },
      },
    ];
    const saved = structuredClone(c.deliveries);
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "needs_attention");
    assert.deepEqual(c.deliveries, saved);
    assert.throws(
      () => approvePostcardProof(c, proof, proof.hash, now),
      /already in progress/,
    );
    assert.throws(() => assertReleasedPostcardProof(c, origin), /hold/);
  } finally {
    readiness(false);
  }
});
test("changed public messages invalidate consent and account email setup is required before release", async () => {
  readiness(true);
  try {
    const c = fixture();
    c.postcardPublicMessages = { q1: "A changed public encouragement." };
    const proof = await buildPostcardProof(c, now, origin);
    assert.throws(
      () => approvePostcardProof(c, proof, proof.hash, now),
      /public postcard messages/,
    );
    c.postcardPublicConsent = {
      version: 2,
      messagesHash: postcardPublicMessagesHash(c),
      approvedAt: now,
    };
    approvePostcardProof(c, proof, proof.hash, now);
    delete process.env.RESEND_API_KEY;
    assert.equal(postcardDeliveryReadiness(origin).ready, false);
    assert.throws(
      () => releasePostcardProof(c, proof.hash, now, origin),
      /Recipient email verification/,
    );
    assert.deepEqual(c.deliveries, []);
  } finally {
    readiness(false);
  }
});
test("a released schedule waits without altering jobs if recipient email verification becomes unavailable", async () => {
  readiness(true);
  try {
    const c = await prepareAutomaticPostcards(fixture(), now, origin);
    const saved = JSON.stringify(c.deliveries);
    delete process.env.RESEND_API_KEY;
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "waiting_for_setup");
    assert.equal(JSON.stringify(c.deliveries), saved);
    assert.equal(c.postcardProof?.releaseStatus, "released");
    readiness(true);
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "ready");
    assert.equal(JSON.stringify(c.deliveries), saved);
  } finally {
    readiness(false);
  }
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
test("long public postcard copy, names and unsupported glyphs are held instead of clipped", async () => {
  for (const field of ["message", "name", "glyph"] as const) {
    const c = fixture();
    if (field === "message") c.postcardPublicMessages = { q1: "W".repeat(240) };
    if (field === "name") c.storyteller.name = "W".repeat(120);
    if (field === "glyph")
      c.postcardPublicMessages = { q1: "A personal note 😀" };
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
        publicMessageApproved: true,
      }),
    }),
    context,
  );
  assert.equal(response.status, 409);
  assert.deepEqual((await store.getCollection(c.id))!.deliveries, []);
});

test("biweekly proof dates span six weeks and are bound to the collection cadence", async () => {
  readiness(false);
  const c = { ...fixture(), postcardCadence: "biweekly" as const };
  const proof = await buildPostcardProof(c, now, origin);
  assert.equal(proof.cadence, "biweekly");
  assert.deepEqual(
    proof.cards.map((card) => card.scheduledFor),
    [
      now,
      "2030-02-14T12:00:00.000Z",
      "2030-02-28T12:00:00.000Z",
      "2030-03-14T12:00:00.000Z",
    ],
  );
  approvePostcardProof(c, proof, proof.hash, now);
  assert.equal(postcardProofIsCurrent(c, proof, origin), true);
  assert.equal(
    postcardProofIsCurrent(
      { ...c, postcardCadence: "quarterly" },
      proof,
      origin,
    ),
    false,
  );
  assert.equal(c.postcardProof?.releaseStatus, "held");
});

test("test printing keys allow held proof approval but cannot release real mail", async () => {
  readiness(true);
  process.env.LOB_API_KEY = "test_fixture_no_provider_call";
  try {
    const state = postcardDeliveryReadiness(origin);
    assert.equal(state.mode, "test");
    assert.equal(state.ready, false);
    assert.match(state.reasons.join(" "), /Test keys cannot send real mail/);
    const c = { ...fixture(), postcardCadence: "biweekly" as const };
    const proof = await buildPostcardProof(c, now, origin);
    approvePostcardProof(c, proof, proof.hash, now);
    assert.ok(c.postcardProof?.approvedAt);
    assert.equal(c.postcardProof?.releaseStatus, "held");
    assert.throws(
      () => releasePostcardProof(c, proof.hash, now, origin),
      /Test keys cannot send real mail/,
    );
    await prepareAutomaticPostcards(c, now, origin);
    assert.equal(c.postcardPreparation?.status, "waiting_for_setup");
    assert.deepEqual(c.deliveries, []);
    delete process.env.LOB_API_KEY;
    assert.equal(postcardDeliveryReadiness(origin).mode, "unconfigured");
  } finally {
    readiness(false);
  }
});
