import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DatabaseAdapter } from "../src/lib/db/adapter";
import type { AnswerTake, Collection } from "../src/lib/collection/types";

let directory: string;
let db: DatabaseAdapter;
let store: typeof import("../src/lib/collection/store");
let prepareCollection: typeof import("../src/lib/collection/create").prepareCollection;
before(async () => {
  for (const name of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[name];
  directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-db-adapter-"));
  process.env.COLLECTION_DATA_DIR = directory;
  store = await import("../src/lib/collection/store");
  ({ prepareCollection } = await import("../src/lib/collection/create"));
  db = (
    await import("../src/lib/db/collection-adapter")
  ).createCollectionDatabaseAdapter();
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Fixture Storyteller", email: "owner@example.test" },
    recipient: { name: "Fixture Recipient", email: "recipient@example.test" },
  });
  await db.stories.create({ collection: c });
  return c;
}
async function take(c: Collection, questionId = "q1"): Promise<AnswerTake> {
  const id = randomUUID();
  await store.putMedia({
    id,
    collectionId: c.id,
    role: "owner",
    provenance: "uploaded_recording",
    mimeType: "audio/webm",
    originalName: "fixture.webm",
    bytes: 100,
    localPath: path.join(directory, "media", id),
    createdAt: c.createdAt,
  });
  return {
    id: randomUUID(),
    questionId,
    prompt: "Fixture question",
    kind: "voice",
    text: "",
    mediaId: id,
    durationSeconds: 3,
    createdAt: c.createdAt,
  };
}
test("concurrent take uploads preserve every take and existing aggregate fields", async () => {
  const c = await fixture();
  const source = await Promise.all(Array.from({ length: 24 }, () => take(c)));
  await Promise.all(
    source.map((item) => db.takes.create(c.id, { take: item })),
  );
  const stored = (await store.getCollection(c.id))!;
  assert.equal(stored.takes.length, 24);
  assert.equal(new Set(stored.takes.map((item) => item.id)).size, 24);
  assert.equal(stored.ownerKey, c.ownerKey);
  assert.deepEqual(stored.chapterBlessings, c.chapterBlessings);
  const projected = await db.takes.list(c.id);
  assert.equal(projected.filter((item) => item.is_selected).length, 1);
  assert.equal(new Set(projected.map((item) => item.take_number)).size, 24);
});
test("optimistic checks conflict with old writers and allow only one concurrent winner", async () => {
  const c = await fixture();
  const initial = (await db.stories.get(c.id))!;
  await store.mutateCollection(c.id, (current) => ({
    ...current,
    currentQuestion: 1,
  }));
  await assert.rejects(
    db.stories.update(
      c.id,
      { title: "Stale title" },
      { expectedRevision: initial.revision },
    ),
    { code: "REVISION_CONFLICT" },
  );
  const latest = (await db.stories.get(c.id))!;
  const results = await Promise.allSettled([
    db.stories.update(
      c.id,
      { title: "First" },
      { expectedRevision: latest.revision },
    ),
    db.stories.update(
      c.id,
      { title: "Second" },
      { expectedRevision: latest.revision },
    ),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
});
test("failed atomic callback rolls back and cannot change access identity", async () => {
  const c = await fixture();
  const revision = (await db.stories.get(c.id))!.revision;
  await assert.rejects(
    db.atomicUpdate(c.id, (current) => {
      current.currentQuestion = 3;
      throw new Error("Fixture interrupted");
    }),
    /Fixture interrupted/,
  );
  assert.equal((await db.stories.get(c.id))!.revision, revision);
  await assert.rejects(
    db.atomicUpdate(c.id, (current) => ({
      ...current,
      ownerKey: "replacement",
    })),
    /identity/,
  );
  assert.equal((await store.getCollection(c.id))!.ownerKey, c.ownerKey);
});
test("followup selections remain independent and foreign media is rejected", async () => {
  const c = await fixture();
  const foreign = await fixture();
  await db.takes.create(c.id, { take: await take(c, "q1") });
  await db.takes.create(c.id, { take: await take(c, "q1-f1") });
  assert.equal(
    (await db.takes.list(c.id)).filter((item) => item.is_selected).length,
    2,
  );
  await assert.rejects(
    db.takes.create(c.id, { take: await take(foreign) }),
    /original recording/,
  );
});
test("organization lookup supports legacy gifts and returns no access keys or private content", async () => {
  const c = await fixture();
  const orgId = randomUUID();
  await store.writeRecord(`org-${orgId}`, {
    recordType: "organization-gifting",
    gifts: [{ claim: { collectionId: c.id } }],
  });
  const rows = await db.getStoriesByOrg(orgId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].org_id, orgId);
  assert.equal(
    rows[0].user_id,
    null,
    "Email identity must not create a verified account binding",
  );
  assert.ok(!JSON.stringify(rows).includes(c.ownerKey));
  assert.ok(!JSON.stringify(rows).includes(c.recipient.email));
});
test("print projections preserve dispatch evidence and cannot rewrite a submitted order", async () => {
  const c = await fixture();
  await store.mutateCollection(c.id, (current) => ({
    ...current,
    deliveries: [
      {
        chapterId: "q1",
        status: "submitted",
        scheduledFor: current.createdAt,
        providerId: "psc_fixture",
        dispatch: {
          idempotencyKey: "private-order-key",
          requestBody: "private-address-and-artwork",
        },
      },
    ],
  }));
  const rows = await db.getPostcardStatus(c.id);
  assert.equal(rows[0].lob_job_id, "psc_fixture");
  assert.equal(rows[0].expected_delivery, null);
  assert.ok(!JSON.stringify(rows).includes("private-address"));
  await assert.rejects(db.printOrders.delete(c.id, "q1"), /preserved/);
  await assert.rejects(
    db.printOrders.update(c.id, "q1", { scheduledFor: c.createdAt }),
    /reconciled/,
  );
  assert.equal(
    (await store.getCollection(c.id))!.deliveries[0].dispatch?.requestBody,
    "private-address-and-artwork",
  );
});
test("recipient revocation preserves reply attribution and suppresses pending messages", async () => {
  const c = await fixture();
  const recipientId = randomUUID();
  await db.recipients.create(c.id, {
    recipient: {
      id: recipientId,
      email: "extra@example.test",
      invitedAt: c.createdAt,
    },
  });
  await store.mutateCollection(c.id, (current) => ({
    ...current,
    replies: [
      {
        id: randomUUID(),
        recipientId,
        chapterId: "q1",
        text: "Saved reply",
        createdAt: c.createdAt,
      },
    ],
    notifications: [
      {
        id: randomUUID(),
        recipientId,
        kind: "recipient_invitation",
        to: "extra@example.test",
        subject: "Fixture",
        text: "Fixture",
        url: "https://example.test",
        dueAt: c.createdAt,
        status: "pending",
      },
    ],
  }));
  await db.recipients.delete(c.id, recipientId);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.replies[0].recipientId, recipientId);
  assert.equal(saved.notifications[0].status, "suppressed");
  assert.equal(await db.recipients.get(c.id, recipientId), null);
  await assert.rejects(
    db.recipients.delete(c.id, "primary"),
    /cannot be removed/,
  );
});
