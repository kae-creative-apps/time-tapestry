import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextRequest } from "next/server";
import { CHAPTERS } from "../src/lib/interview-state";

test("protected delivery automation separates email from printing and sends only current approved snapshots", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-delivery-automation-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://example.com",
    COLLECTION_DELIVERY_ENABLED: "false",
    COLLECTION_EMAIL_ENABLED: "true",
    CRON_SECRET: "fixture-private-scheduler",
    RESEND_API_KEY: "fixture-private-resend",
    RESEND_FROM_EMAIL: "fixture@example.com",
  });
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "LOB_API_KEY",
    "LOB_FROM_ADDRESS_ID",
    "LOB_WEBHOOK_SECRET",
  ])
    delete process.env[key];
  const { prepareCollection } = await import("../src/lib/collection/create");
  const { approveCollection } = await import("../src/lib/collection/content");
  const { getCollection, writeRecord, mutateCollection } =
    await import("../src/lib/collection/store");
  const { processDeliveryJobs, notificationSuppressionReason } =
    await import("../src/lib/collection/delivery");
  const {
    buildPostcardProof,
    approvePostcardProof,
    releasePostcardProof,
    postcardPublicMessagesHash,
  } = await import("../src/lib/collection/postcard-proofs");
  const { queueFilmsReady } =
    await import("../src/lib/collection/notifications");
  const { GET: run } = await import("../src/app/api/collection/jobs/route");
  const { linksFor } = await import("../src/lib/collection/access");
  const draft = () => {
    const c = prepareCollection({
      initiationPath: "share",
      storyteller: { name: "Narrator", email: "owner@example.test" },
      recipient: { name: "Recipient", email: "recipient@example.test" },
      address: {
        line1: "1 Fixture Way",
        city: "Example",
        region: "CA",
        postalCode: "90001",
        country: "US",
      },
    });
    c.status = "draft";
    c.chapters = CHAPTERS.map((ch) => ({
      id: ch.id,
      title: ch.title,
      content: "A fixture story.",
      postcardNote: "A fixture note.",
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    }));
    c.postcardPublicConsent = {
      version: 2,
      messagesHash: postcardPublicMessagesHash(c),
      approvedAt: c.createdAt,
    };
    return c;
  };
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown>; key: string }[] =
    [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    assert.ok(
      [
        "https://api.resend.com/emails",
        "https://api.lob.com/v1/postcards",
      ].includes(url),
    );
    assert.equal(options?.redirect, "error");
    calls.push({
      url,
      body: JSON.parse(String(options?.body)),
      key: new Headers(options?.headers).get("Idempotency-Key")!,
    });
    return new Response(
      JSON.stringify({
        id: url.includes("lob.com") ? "psc_fixture123" : "fixture-email123",
      }),
      { status: 200 },
    );
  };
  try {
    const c = approveCollection(draft(), new Date().toISOString(), {
      deliveryMode: "digital",
    });
    const digital = {
      id: `${c.id}:digital-ready`,
      kind: "collection_ready" as const,
      to: c.recipient.email,
      subject: "Ready",
      text: "Approved story",
      url: process.env.NEXT_PUBLIC_APP_URL + linksFor(c).collection,
      dueAt: c.approvedAt!,
      status: "pending" as const,
    };
    assert.equal(notificationSuppressionReason(c, digital), null);
    assert.equal(digital.url, `https://example.com/collection/${c.id}`);
    assert.equal(linksFor(c).address, `/collection/${c.id}/address`);
    assert.equal(
      notificationSuppressionReason(c, {
        ...digital,
        url: `${digital.url}?key=${c.recipientKey}`,
      }),
      null,
      "A previously queued recipient link remains a locator requiring email verification",
    );
    for (const url of [
      `${digital.url}?key=another-recipient-key`,
      `${digital.url}?key=${c.recipientKey}&extra=1`,
      `https://outside.example/collection/${c.id}?key=${c.recipientKey}`,
    ])
      assert.match(
        notificationSuppressionReason(c, { ...digital, url })!,
        /recipient/,
      );
    assert.match(
      notificationSuppressionReason({ ...c, status: "draft" }, digital)!,
      /not been approved/,
    );
    assert.match(
      notificationSuppressionReason(c, {
        ...digital,
        to: "wrong@example.test",
      })!,
      /recipient/,
    );
    assert.match(
      notificationSuppressionReason(c, {
        ...digital,
        url: `https://example.com/collection/${c.id}?key=${c.ownerKey}`,
      })!,
      /recipient/,
    );
    const confirmation = {
      ...digital,
      id: `${c.id}:owner-approved`,
      kind: "review_ready" as const,
      to: c.storyteller.email,
      url: process.env.NEXT_PUBLIC_APP_URL + linksFor(c).review,
    };
    assert.equal(notificationSuppressionReason(c, confirmation), null);
    assert.match(
      notificationSuppressionReason(c, {
        ...confirmation,
        to: c.recipient.email,
      })!,
      /storyteller/,
    );
    assert.match(
      notificationSuppressionReason({ ...c, status: "draft" }, confirmation)!,
      /not been approved/,
    );
    assert.match(
      notificationSuppressionReason(c, {
        ...confirmation,
        id: `${c.id}:films-ready:old`,
      })!,
      /no longer/,
    );
    c.notifications.push(digital);
    await writeRecord(c.id, c);
    const denied = await run(
      new NextRequest("https://example.com/api/collection/jobs"),
    );
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);
    const accepted = await run(
      new NextRequest("https://example.com/api/collection/jobs", {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    assert.equal(accepted.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal((await getCollection(c.id))!.notifications[0].status, "sent");
    await processDeliveryJobs();
    assert.equal(
      calls.length,
      1,
      "Saved provider acceptance prevents duplicate emails",
    );

    const reviewing = draft();
    queueFilmsReady(reviewing, "fixture-job");
    queueFilmsReady(reviewing, "fixture-job");
    assert.equal(reviewing.notifications.length, 1);
    await writeRecord(reviewing.id, reviewing);
    await processDeliveryJobs();
    assert.equal(calls.length, 2);
    assert.equal(
      (await getCollection(reviewing.id))!.notifications[0].status,
      "sent",
    );

    process.env.COLLECTION_DELIVERY_ENABLED = "true";
    process.env.LOB_API_KEY = "fixture-private-lob";
    process.env.LOB_FROM_ADDRESS_ID = "adr_fixture";
    process.env.LOB_WEBHOOK_SECRET = "fixture-signing-secret";
    // Noon is fixed by the printed schedule; use yesterday only after release to exercise an overdue due card.
    const postal = approveCollection(draft(), new Date().toISOString());
    const today = new Date().toISOString();
    const proof = await buildPostcardProof(postal, today);
    approvePostcardProof(postal, proof, proof.hash);
    releasePostcardProof(postal, proof.hash);
    postal.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    await writeRecord(postal.id, postal);
    await processDeliveryJobs();
    assert.equal(
      (await getCollection(c.id))!.postcardProof,
      undefined,
      "Enabling printing must not opt a legacy digital gift into mail",
    );
    assert.equal((await getCollection(c.id))!.deliveries.length, 0);
    const printed = calls.find((call) => call.url.includes("lob.com"));
    assert.ok(printed);
    assert.ok(
      printed.body.front === proof.cards[0].front,
      "Frozen front remains byte-for-byte identical",
    );
    assert.ok(
      printed.body.back === proof.cards[0].back,
      "Frozen back remains byte-for-byte identical",
    );
    assert.equal(
      (printed.body.to as Record<string, unknown>).address_line1,
      proof.address.line1,
    );
    assert.equal(
      (await getCollection(postal.id))!.deliveries[0].status,
      "submitted",
    );
    const printCount = calls.filter((call) =>
      call.url.includes("lob.com"),
    ).length;
    await processDeliveryJobs();
    assert.equal(
      calls.filter((call) => call.url.includes("lob.com")).length,
      printCount,
    );

    const legacy = approveCollection(draft(), today);
    const legacyProof = await buildPostcardProof(legacy, today);
    approvePostcardProof(legacy, legacyProof, legacyProof.hash);
    releasePostcardProof(legacy, legacyProof.hash);
    legacy.postcardProof!.version = 1;
    delete legacy.postcardProof!.accessPolicy;
    delete legacy.postcardProof!.publicMessageHash;
    delete legacy.postcardPublicConsent;
    legacy.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    const legacySnapshot = JSON.stringify(legacy.postcardProof);
    const legacySchedule = JSON.stringify(legacy.deliveries);
    await writeRecord(legacy.id, legacy);
    await processDeliveryJobs();
    await processDeliveryJobs();
    const heldLegacy = (await getCollection(legacy.id))!;
    assert.equal(heldLegacy.postcardPreparation?.status, "needs_attention");
    assert.equal(JSON.stringify(heldLegacy.postcardProof), legacySnapshot);
    assert.equal(JSON.stringify(heldLegacy.deliveries), legacySchedule);
    assert.equal(
      calls.filter((call) => call.url.includes("lob.com")).length,
      printCount,
    );

    const mismatched = approveCollection(draft(), today);
    const another = await buildPostcardProof(mismatched, today);
    approvePostcardProof(mismatched, another, another.hash);
    releasePostcardProof(mismatched, another.hash);
    mismatched.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    mismatched.deliveries[0].dispatch = {
      attempts: 1,
      requestBody: '{"front":"old artwork"}',
    };
    await writeRecord(mismatched.id, mismatched);
    await processDeliveryJobs();
    assert.equal(
      calls.filter((call) => call.url.includes("lob.com")).length,
      printCount,
    );
    assert.equal(
      (await getCollection(mismatched.id))!.deliveries[0].dispatch
        ?.reconciliationRequired,
      true,
    );
    assert.match(
      (await getCollection(mismatched.id))!.deliveries[0].error!,
      /differs/,
    );

    const stale = approveCollection(draft(), today);
    const staleProof = await buildPostcardProof(stale, today);
    approvePostcardProof(stale, staleProof, staleProof.hash);
    releasePostcardProof(stale, staleProof.hash);
    stale.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    stale.deliveries[0].dispatch = { attempts: 1 };
    stale.chapters[0].postcardNote = "Changed after dispatch began";
    await writeRecord(stale.id, stale);
    await processDeliveryJobs();
    assert.equal(
      calls.filter((call) => call.url.includes("lob.com")).length,
      printCount,
    );
    assert.equal(
      (await getCollection(stale.id))!.postcardPreparation?.status,
      "needs_attention",
    );
    assert.equal(
      (await getCollection(stale.id))!.deliveries[0].dispatch?.attempts,
      1,
    );

    await mutateCollection(c.id, (current) => {
      current.notifications.push({ ...digital, id: `${c.id}:legacy-ready` });
      return current;
    });
    await processDeliveryJobs();
    assert.equal(
      (await getCollection(c.id))!.notifications.at(-1)!.status,
      "suppressed",
      "Postal sharing remains first-card-first",
    );
    // Test the actual owner approval endpoint without a provider send or authentication bypass.
    process.env.COLLECTION_DELIVERY_ENABLED = "false";
    process.env.SECURITY_LOCAL_BYPASS = "true";
    process.env.SECURITY_TEST_BYPASS = "true";
    const { POST: updateCollection } =
      await import("../src/app/api/collection/[id]/route");
    const pending = draft();
    await writeRecord(pending.id, pending);
    const apiApproval = await updateCollection(
      new NextRequest(
        `http://localhost/api/collection/${pending.id}?key=${pending.ownerKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            deliveryMode: "digital",
            autoPostcards: true,
          }),
        },
      ),
      { params: Promise.resolve({ id: pending.id }) },
    );
    assert.equal(apiApproval.status, 200);
    const approvedPending = (await getCollection(pending.id))!;
    assert.equal(approvedPending.autoPostcards, true);
    assert.equal(approvedPending.status, "approved");
    assert.equal(approvedPending.postcardProof?.releaseStatus, "held");
    assert.equal(
      approvedPending.notifications.some((n) => n.kind === "collection_ready"),
      false,
    );
    const ownerConfirmation = approvedPending.notifications.find(
      (n) => n.id === `${pending.id}:owner-approved`,
    )!;
    assert.equal(
      notificationSuppressionReason(approvedPending, ownerConfirmation),
      null,
    );
    await processDeliveryJobs();
    assert.equal(
      (await getCollection(pending.id))!.notifications.find(
        (n) => n.id === ownerConfirmation.id,
      )!.status,
      "sent",
    );
    process.env.COLLECTION_EMAIL_ENABLED = "false";
    process.env.COLLECTION_DELIVERY_ENABLED = "false";
    const disabled = await run(
      new NextRequest("https://example.com/api/collection/jobs", {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    assert.equal(disabled.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
