import { syntheticRecordedFilmCollection } from "./film-fixture";
import {
  attachSyntheticOriginalFilms,
  recordedApproval,
} from "./recorded-review-fixture";
import { historicalApprovedCollection } from "./historical-delivery-fixture";
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
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "fixture-public-site-key",
    TURNSTILE_SECRET_KEY: "fixture-private-turnstile",
    KV_REST_API_URL: "https://fixture.invalid",
    KV_REST_API_TOKEN: "fixture-private-kv",
  });
  for (const key of [
    "VERCEL",
    "LOB_API_KEY",
    "LOB_FROM_ADDRESS_ID",
    "LOB_WEBHOOK_SECRET",
  ])
    delete process.env[key];
  const { prepareCollection } = await import("../src/lib/collection/create");
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
  // Exercise hosted readiness without touching a real KV service. Keep the
  // record and lease operations used by the delivery worker in memory.
  const records = new Map<string, unknown>();
  const calls: {
    url: string;
    body: Record<string, unknown>;
    key: string;
    bytes: Buffer;
    contentType: string;
  }[] = [];
  let failNextPostcard = false;
  globalThis.fetch = async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url).origin === "https://fixture.invalid") {
      const payload = JSON.parse(
        input instanceof Request ? await input.text() : String(options?.body),
      );
      const command = ([operation, ...args]: unknown[]) => {
        const name = String(operation).toLowerCase();
        const key = String(args[0]);
        if (name === "get") return { result: records.get(key) ?? null };
        if (name === "keys") {
          assert.ok(["collection-v2:*", "collection-v2:media-*"].includes(key));
          return {
            result: [...records.keys()].filter((item) =>
              item.startsWith(key.slice(0, -1)),
            ),
          };
        }
        if (name === "set") {
          if (args.includes("nx") && records.has(key)) return { result: null };
          records.set(key, args[1]);
          return { result: "OK" };
        }
        if (name === "eval") {
          const script = String(args[0]);
          const keyCount = Number(args[1]);
          const keys = args.slice(2, 2 + keyCount).map(String);
          const values = args.slice(2 + keyCount);
          assert.ok(script.includes("redis.call('get',KEYS[1]) == ARGV[1]"));
          if (records.get(keys[0]) !== values[0]) return { result: 0 };
          if (keyCount === 2 && script.includes("redis.call('set'"))
            records.set(keys[1], values[1]);
          else if (keyCount === 1 && script.includes("redis.call('del'"))
            records.delete(keys[0]);
          else throw new Error("Unexpected synthetic KV script.");
          return { result: 1 };
        }
        throw new Error(`Unexpected synthetic KV operation: ${name}`);
      };
      return Response.json(
        Array.isArray(payload[0]) ? payload.map(command) : command(payload),
      );
    }
    assert.ok(
      [
        "https://api.resend.com/emails",
        "https://api.lob.com/v1/postcards",
      ].includes(url),
    );
    assert.equal(options?.redirect, "error");
    const request = new Request(url, options);
    const bytes = Buffer.from(await request.clone().arrayBuffer());
    const contentType = request.headers.get("Content-Type")!;
    let body: Record<string, unknown>;
    if (url.includes("lob.com")) {
      assert.match(contentType, /^multipart\/form-data; boundary=tt-/);
      body = {};
      for (const [field, value] of await request.formData()) {
        assert.equal(field.startsWith("__"), false);
        if (value instanceof File) {
          assert.ok(["front", "back"].includes(field));
          assert.equal(value.name, `${field}.html`);
          assert.match(value.type, /^text\/html/);
          body[field] = await value.text();
        } else {
          const nested = /^(to|from)\[([a-z][a-z0-9_]*)\]$/.exec(field);
          if (nested) {
            const address = (body[nested[1]] ||= {});
            (address as Record<string, string>)[nested[2]] = value;
          } else body[field] = value;
        }
      }
    } else {
      assert.equal(contentType, "application/json");
      body = await request.json();
    }
    calls.push({
      url,
      body,
      key: request.headers.get("Idempotency-Key")!,
      bytes,
      contentType,
    });
    if (url.includes("lob.com") && failNextPostcard) {
      failNextPostcard = false;
      return new Response("Synthetic retryable failure", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        id: url.includes("lob.com") ? "psc_fixture123" : "fixture-email123",
      }),
      { status: 200 },
    );
  };
  try {
    const c = historicalApprovedCollection(draft(), new Date().toISOString(), {
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

    const reviewing = await attachSyntheticOriginalFilms(await syntheticRecordedFilmCollection());
    const readyJobId = reviewing.chapters[0].film!.jobId;
    queueFilmsReady(reviewing, readyJobId);
    queueFilmsReady(reviewing, readyJobId);
    assert.equal(reviewing.notifications.length, 1);
    await writeRecord(reviewing.id, reviewing);
    await processDeliveryJobs();
    assert.equal(calls.length, 2);
    assert.equal(
      (await getCollection(reviewing.id))!.notifications[0].status,
      "sent",
    );

    process.env.COLLECTION_DELIVERY_ENABLED = "true";
    process.env.LOB_API_KEY = "live_fixture_private_lob";
    process.env.LOB_FROM_ADDRESS_ID = "adr_fixture";
    process.env.LOB_WEBHOOK_SECRET = "fixture-signing-secret";
    // Noon is fixed by the printed schedule; use yesterday only after release to exercise an overdue due card.
    const postal = historicalApprovedCollection(
      draft(),
      new Date().toISOString(),
    );
    const today = new Date().toISOString();
    const proof = await buildPostcardProof(postal, today);
    approvePostcardProof(postal, proof, proof.hash);
    releasePostcardProof(postal, proof.hash);
    postal.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    await writeRecord(postal.id, postal);
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    await processDeliveryJobs();
    const heldForSignIn = (await getCollection(postal.id))!;
    assert.equal(
      heldForSignIn.postcardPreparation?.status,
      "waiting_for_setup",
    );
    assert.equal(heldForSignIn.deliveries[0].dispatch, undefined);
    assert.equal(
      calls.some((call) => call.url.includes("lob.com")),
      false,
    );
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "fixture-public-site-key";
    process.env.LOB_API_KEY = "test_fixture_private_lob";
    const scheduleBeforeTestMode = JSON.stringify(heldForSignIn.deliveries);
    await processDeliveryJobs();
    const heldForTestMode = (await getCollection(postal.id))!;
    assert.equal(
      heldForTestMode.postcardPreparation?.status,
      "waiting_for_setup",
    );
    assert.equal(
      JSON.stringify(heldForTestMode.deliveries),
      scheduleBeforeTestMode,
    );
    assert.equal(
      calls.some((call) => call.url.includes("lob.com")),
      false,
    );
    process.env.LOB_API_KEY = "live_fixture_private_lob";
    failNextPostcard = true;
    await processDeliveryJobs();
    const firstAttempt = calls.find((call) => call.url.includes("lob.com"))!;
    const frozenDispatch = (await getCollection(postal.id))!.deliveries[0]
      .dispatch!;
    assert.equal(frozenDispatch.attempts, 1);
    assert.ok(
      frozenDispatch.requestBody?.includes("__timeTapestryLobTransport"),
    );
    await mutateCollection(postal.id, (current) => {
      current.deliveries[0].dispatch!.nextAttemptAt = new Date(
        Date.now() - 1,
      ).toISOString();
      return current;
    });
    await processDeliveryJobs();
    const retried = calls
      .filter((call) => call.url.includes("lob.com"))
      .at(-1)!;
    assert.deepEqual(retried.bytes, firstAttempt.bytes);
    assert.equal(retried.contentType, firstAttempt.contentType);
    assert.equal(retried.key, firstAttempt.key);
    assert.deepEqual(retried.body.to, firstAttempt.body.to);
    assert.equal(
      (await getCollection(postal.id))!.deliveries[0].dispatch!.requestBody,
      frozenDispatch.requestBody,
    );
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

    const legacy = historicalApprovedCollection(draft(), today);
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

    const mismatched = historicalApprovedCollection(draft(), today);
    const another = await buildPostcardProof(mismatched, today);
    approvePostcardProof(mismatched, another, another.hash);
    releasePostcardProof(mismatched, another.hash);
    mismatched.deliveries[0].scheduledFor = new Date(
      Date.now() - 86400000,
    ).toISOString();
    const legacyRequestBody = JSON.stringify({
      ...JSON.parse(frozenDispatch.requestBody!).payload,
      description: `Time Tapestry ${mismatched.id} v${mismatched.approvedVersion || 1} q1`,
      front: another.cards[0].front,
      back: another.cards[0].back,
    });
    mismatched.deliveries[0].dispatch = {
      attempts: 1,
      requestBody: legacyRequestBody,
      idempotencyKey: "legacy-saved-idempotency-key",
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
    const heldLegacyRequest = (await getCollection(mismatched.id))!
      .deliveries[0].dispatch!;
    assert.equal(heldLegacyRequest.requestBody, legacyRequestBody);
    assert.equal(
      heldLegacyRequest.idempotencyKey,
      "legacy-saved-idempotency-key",
    );
    assert.equal(heldLegacyRequest.attempts, 1);

    const stale = historicalApprovedCollection(draft(), today);
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
    const pending = await syntheticRecordedFilmCollection();
    const deliveryDetails = draft();
    pending.storyteller = deliveryDetails.storyteller;
    pending.recipient = deliveryDetails.recipient;
    pending.requester = deliveryDetails.requester;
    pending.address = deliveryDetails.address;
    pending.addressConfirmed = deliveryDetails.addressConfirmed;
    pending.postcardPublicConsent = {
      version: 2,
      messagesHash: postcardPublicMessagesHash(pending),
      approvedAt: pending.createdAt,
    };
    const filmsReady = await attachSyntheticOriginalFilms(pending);
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
            ...recordedApproval(filmsReady),
          }),
        },
      ),
      { params: Promise.resolve({ id: pending.id }) },
    );
    assert.equal(apiApproval.status, 200, await apiApproval.clone().text());
    const approvedPending = (await getCollection(pending.id))!;
    assert.equal(approvedPending.autoPostcards, true);
    assert.equal(approvedPending.status, "approved");
    assert.equal(approvedPending.postcardProof?.releaseStatus, "held");
    assert.equal(
      approvedPending.notifications.filter((n) => n.kind === "collection_ready")
        .length,
      1,
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
