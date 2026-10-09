import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { syntheticFilmCollection } from "./film-fixture";

test("recurring bounded delivery shares work fairly and retries a temporary email failure inside its idempotency window", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "delivery-recovery-"));
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://delivery.example.test",
    COLLECTION_EMAIL_ENABLED: "true",
    COLLECTION_DELIVERY_ENABLED: "false",
    RESEND_API_KEY: "synthetic-never-sent",
    RESEND_FROM_EMAIL: "fixture@example.test",
  });
  const store = await import("../src/lib/collection/store");
  const { processDeliveryJobs } =
    await import("../src/lib/collection/delivery");
  const delivered: string[] = [],
    keys: string[] = [];
  let fail = true;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      const payload = JSON.parse(String(init?.body));
      delivered.push(payload.to[0]);
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      if (payload.to[0] === "owner-0@example.test" && fail) {
        fail = false;
        return new Response("Synthetic temporary failure", { status: 503 });
      }
      return Response.json({ id: `synthetic-email-${delivered.length}` });
    },
  );
  try {
    const collections = Array.from({ length: 4 }, (_, index) => {
      const c = syntheticFilmCollection();
      c.id = `fair-collection-${index}`;
      c.status = "invited";
      c.storyteller.email = `owner-${index}@example.test`;
      c.notifications = Array.from(
        { length: index === 0 ? 8 : 1 },
        (_, notice) => ({
          id: `${c.id}:invite:${notice}`,
          kind: "invitation" as const,
          to: c.storyteller.email,
          subject: "Synthetic invitation",
          text: "Fixture only",
          url: `https://delivery.example.test/record/${c.id}?key=${c.ownerKey}`,
          dueAt: c.createdAt,
          status: "pending" as const,
        }),
      );
      return c;
    });
    for (const c of collections) await store.putCollection(c);
    assert.equal((await processDeliveryJobs()).providerAttempts, 3);
    assert.deepEqual(delivered, [
      "owner-0@example.test",
      "owner-1@example.test",
      "owner-2@example.test",
    ]);
    const pending = (await store.getCollection(collections[0].id))!
      .notifications[0];
    assert.equal(pending.dispatch?.attempts, 1);
    assert.equal(pending.dispatch?.reconciliationRequired, false);
    assert.ok(
      Date.parse(pending.dispatch!.nextAttemptAt!) -
        Date.parse(pending.dispatch!.firstAttemptAt!) <
        23 * 60 * 60 * 1000,
    );
    // Simulate the next frequent worker pass without sleeping or sending mail.
    await store.mutateCollection(collections[0].id, (c) => {
      c.notifications[0].dispatch!.nextAttemptAt = new Date(0).toISOString();
      return c;
    });
    await processDeliveryJobs();
    assert.equal(
      delivered[3],
      "owner-3@example.test",
      "busy first collection cannot starve later collections",
    );
    assert.equal(
      (await store.getCollection(collections[0].id))!.notifications[0].status,
      "sent",
    );
    assert.equal(
      keys[0],
      keys[4],
      "retry reuses the same frozen request identity",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one daily slot sends the recipient invite instead of a superseded storyteller notice", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "delivery-recipient-first-"),
  );
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    COLLECTION_DATA_DIR: directory,
    NEXT_PUBLIC_APP_URL: "https://delivery.example.test",
    COLLECTION_EMAIL_ENABLED: "true",
    COLLECTION_DELIVERY_ENABLED: "false",
    RESEND_API_KEY: "synthetic-never-sent",
    RESEND_FROM_EMAIL: "fixture@example.test",
  });
  const store = await import("../src/lib/collection/store");
  const { processDeliveryJobs } =
    await import("../src/lib/collection/delivery");
  const subjects: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(String(input), "https://api.resend.com/emails");
      subjects.push(JSON.parse(String(init?.body)).subject);
      return Response.json({ id: `synthetic-email-${subjects.length}` });
    },
  );
  try {
    const c = syntheticFilmCollection();
    c.id = "qa-recipient-first";
    c.status = "approved";
    c.storyteller.email = "storyteller@example.test";
    c.recipient.email = "recipient@example.test";
    c.notifications = [
      {
        id: `${c.id}:preparation-attention:prep_stale`,
        kind: "preparation_attention",
        to: c.storyteller.email,
        subject: "Your Time Tapestry preparation needs attention",
        text: "Fixture",
        url: `https://delivery.example.test/collection/${c.id}/review?key=${c.ownerKey}`,
        dueAt: c.createdAt,
        status: "pending",
      },
      {
        id: `${c.id}:export-ready:film_${"a".repeat(64)}`,
        kind: "review_ready",
        to: c.storyteller.email,
        subject: "Your downloadable Time Tapestry videos are ready",
        text: "Fixture",
        url: `https://delivery.example.test/collection/${c.id}/review?key=${c.ownerKey}`,
        dueAt: c.createdAt,
        status: "pending",
      },
      {
        id: `${c.id}:digital-ready`,
        kind: "collection_ready",
        to: c.recipient.email,
        subject: "A story for you from Storyteller",
        text: "Fixture",
        url: `https://delivery.example.test/collection/${c.id}`,
        dueAt: c.createdAt,
        status: "pending",
      },
    ];
    await store.putCollection(c);
    assert.equal((await processDeliveryJobs()).providerAttempts, 1);
    assert.deepEqual(subjects, ["A story for you from Storyteller"]);
    const saved = (await store.getCollection(c.id))!;
    assert.equal(
      saved.notifications.find((n) => n.kind === "collection_ready")?.status,
      "sent",
    );
    assert.equal(
      saved.notifications.find((n) => n.kind === "preparation_attention")
        ?.status,
      "suppressed",
    );
    assert.notEqual(
      saved.notifications.find((n) => n.id.includes("export-ready"))?.status,
      "sent",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
