import { historicalApprovedCollection } from "./historical-delivery-fixture";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

test("address updates preserve started mailings and safely replace untouched schedules", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-address-hold-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.com",
    COLLECTION_DELIVERY_ENABLED: "true",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    LOB_API_KEY: "test_address_hold_fixture",
    LOB_FROM_ADDRESS_ID: "adr_fixture",
  });
  for (const key of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"])
    delete process.env[key];
  const { prepareCollection } = await import("../src/lib/collection/create");
  const { CHAPTERS } = await import("../src/lib/interview-state");
  const {
    buildPostcardProof,
    approvePostcardProof,
    postcardPublicMessagesHash,
    postcardProofIsCurrent,
  } = await import("../src/lib/collection/postcard-proofs");
  const { getCollection, putCollection } =
    await import("../src/lib/collection/store");
  const { processDeliveryJobs, nextDuePostcard } =
    await import("../src/lib/collection/delivery");
  const { POST } = await import("../src/app/api/collection/[id]/route");
  const previousFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error(
      "This address-hold regression must not contact a provider.",
    );
  };
  try {
    for (const status of ["untouched", "submitted", "mailed"] as const) {
      await t.test(status, async () => {
        const start = "2025-01-01T12:00:00.000Z";
        const draft = prepareCollection({
          initiationPath: "share",
          storyteller: { name: "Storyteller", email: "owner@example.test" },
          recipient: {
            name: "Recipient",
            email: `recipient-${status}@example.test`,
          },
          address: {
            line1: "1 Fixture Way",
            city: "Example",
            region: "CA",
            postalCode: "90001",
            country: "US",
          },
        });
        draft.status = "draft";
        draft.chapters = CHAPTERS.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          content: "A fixture story.",
          postcardNote: "A fixture note.",
          sourceTakeIds: [],
          videoStatus: "not_requested",
          editorialReviewed: true,
          generatedWith: "source_text",
        }));
        const collection = historicalApprovedCollection(draft, start, {
          deliveryMode: "digital",
        });
        collection.autoPostcards = true;
        collection.postcardPublicConsent = {
          version: 2,
          messagesHash: postcardPublicMessagesHash(collection),
          approvedAt: start,
        };
        const proof = await buildPostcardProof(collection, start);
        approvePostcardProof(collection, proof, proof.hash, start);
        // Seed an already released historical mailing. Current setup must never
        // be used to reauthorize or rewrite that provider request.
        collection.postcardProof!.releaseStatus = "released";
        collection.postcardProof!.releasedAt = start;
        collection.deliveries = proof.cards.map((card) => ({
          chapterId: card.chapterId,
          scheduledFor: card.scheduledFor,
          status: "scheduled",
        }));
        if (status !== "untouched")
          collection.deliveries[0] = {
            ...collection.deliveries[0],
            status,
            providerId: `psc_fixture${status}`,
            ...(status === "mailed" ? { mailedAt: start } : {}),
            dispatch: {
              attempts: 1,
              idempotencyKey: `address-hold/${collection.id}/q1`,
              requestBody: JSON.stringify({
                to: proof.address,
                front: proof.cards[0].front,
                back: proof.cards[0].back,
              }),
            },
          };
        const savedProof = JSON.stringify(collection.postcardProof);
        const savedDeliveries = JSON.stringify(collection.deliveries);
        await putCollection(collection);
        const cookie = await verifiedRecipientCookie(
          collection.recipient.email,
        );
        const response = await POST(
          new NextRequest(`http://localhost/api/collection/${collection.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({
              action: "address",
              address: { ...collection.address, line1: "2 Updated Way" },
            }),
          }),
          { params: Promise.resolve({ id: collection.id }) },
        );
        assert.equal(response.status, 200);
        let saved = (await getCollection(collection.id))!;
        assert.equal(saved.address!.line1, "2 Updated Way");
        if (status === "untouched") {
          assert.equal(postcardProofIsCurrent(saved), true);
          assert.equal(saved.postcardProof!.address.line1, "2 Updated Way");
          assert.notEqual(saved.postcardProof!.hash, proof.hash);
          assert.equal(saved.postcardPreparation?.status, "waiting_for_setup");
          assert.equal(saved.postcardProof!.releaseStatus, "held");
          assert.equal(
            saved.deliveries.length,
            0,
            "The untouched old-address schedule must be replaced before dispatch",
          );
          assert.equal(providerCalls, 0);
          return;
        }
        assert.equal(saved.postcardPreparation?.status, "needs_attention");
        const attention = saved.notifications.filter(
          (notice) => notice.kind === "postcard_attention",
        );
        assert.equal(attention.length, 1);
        assert.equal(attention[0].to, saved.storyteller.email);
        assert.match(attention[0].text, /Contact the Time Tapestry team/);
        assert.equal(postcardProofIsCurrent(saved), false);
        assert.equal(JSON.stringify(saved.postcardProof), savedProof);
        assert.equal(JSON.stringify(saved.deliveries), savedDeliveries);
        if (status === "mailed")
          assert.equal(
            nextDuePostcard(saved)?.chapterId,
            "q2",
            "A due date alone must not bypass the stale-proof hold",
          );
        await processDeliveryJobs();
        await processDeliveryJobs();
        saved = (await getCollection(collection.id))!;
        assert.equal(
          saved.notifications.filter(
            (notice) => notice.kind === "postcard_attention",
          ).length,
          1,
        );
        assert.equal(saved.postcardPreparation?.status, "needs_attention");
        assert.equal(JSON.stringify(saved.postcardProof), savedProof);
        assert.equal(JSON.stringify(saved.deliveries), savedDeliveries);
        assert.equal(
          providerCalls,
          0,
          "Neither the old nor new address may be dispatched without reconciliation",
        );
      });
    }
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
