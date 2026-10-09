import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { parseOrganizationJoinToken } from "../src/lib/organizations/join-token";
import type { OrganizationRecord } from "../src/lib/organizations/types";

let directory: string;
let create: typeof import("../src/app/api/organizations/route").POST;
let managerGet: typeof import("../src/app/api/organizations/[id]/route").GET;
let giftsPost: typeof import("../src/app/api/organizations/[id]/gifts/route").POST;
let giftGet: typeof import("../src/app/api/organizations/[id]/gifts/[giftId]/route").GET;
let giftPost: typeof import("../src/app/api/organizations/[id]/gifts/[giftId]/route").POST;
let store: typeof import("../src/lib/collection/store");
let factory: typeof import("../src/lib/collection/create");

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  for (const name of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "RESEND_API_KEY",
    "LOB_API_KEY",
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "COLLECTION_DELIVERY_ENABLED",
  ])
    delete process.env[name];
  directory = await mkdtemp(
    path.join(os.tmpdir(), "time-tapestry-organizations-"),
  );
  process.env.COLLECTION_DATA_DIR = directory;
  create = (await import("../src/app/api/organizations/route")).POST;
  managerGet = (await import("../src/app/api/organizations/[id]/route")).GET;
  giftsPost = (await import("../src/app/api/organizations/[id]/gifts/route"))
    .POST;
  const giftRoute =
    await import("../src/app/api/organizations/[id]/gifts/[giftId]/route");
  giftGet = giftRoute.GET;
  giftPost = giftRoute.POST;
  store = await import("../src/lib/collection/store");
  factory = await import("../src/lib/collection/create");
});
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const giftContext = (id: string, giftId: string) => ({
  params: Promise.resolve({ id, giftId }),
});
const req = (url: string, body?: unknown) =>
  new NextRequest(
    `http://localhost${url}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
const organizationInput = (quantity = 2) => ({
  organizationName: "Example Church",
  organizationType: "church",
  contactName: "Alex Organizer",
  contactEmail: "organizer@example.com",
  quantity,
});
const shareInput = () => ({
  initiationPath: "share",
  storyteller: { name: "Alex Storyteller", email: "storyteller@example.com" },
  recipient: { name: "Sam Recipient", email: "recipient@example.com" },
  claimToken: randomUUID(),
});
type Group = { id: string; key: string; url: string };
type Gift = { giftId: string; key: string; url: string };
async function group(quantity = 2): Promise<Group> {
  const result = await create(
    req("/api/organizations", organizationInput(quantity)),
  );
  assert.equal(result.status, 201);
  const body = await result.json();
  const link = new URL(body.nextUrl, "http://localhost");
  return {
    id: body.organization.id,
    key: link.searchParams.get("key")!,
    url: link.pathname + link.search,
  };
}
function managerUrl(g: Group) {
  return `/api/organizations/${g.id}?key=${g.key}`;
}
function giftsUrl(g: Group) {
  return `/api/organizations/${g.id}/gifts?key=${g.key}`;
}
function claimUrl(g: Group, gift: Gift) {
  return `/api/organizations/${g.id}/gifts/${gift.giftId}?key=${gift.key}`;
}
async function issue(g: Group, name = "Gift Recipient"): Promise<Gift> {
  const result = await giftsPost(
    req(giftsUrl(g), { name, email: "gift@example.com" }),
    context(g.id),
  );
  assert.equal(result.status, 201);
  const body = await result.json();
  const url = new URL(body.giftUrl, "http://localhost");
  const invitation = parseOrganizationJoinToken(
    url.pathname.split("/").at(-1)!,
  );
  assert.ok(invitation);
  return {
    giftId: invitation.giftId,
    key: invitation.accessKey,
    url: url.pathname + url.search,
  };
}
async function view(g: Group) {
  const result = await managerGet(req(managerUrl(g)), context(g.id));
  assert.equal(result.status, 200);
  return (await result.json()).organization;
}
async function redeem(g: Group, gift: Gift, input: unknown) {
  return giftPost(
    req(claimUrl(g, gift), input),
    giftContext(g.id, gift.giftId),
  );
}

test("free group creation validates limits and returns only a safe management view", async () => {
  for (const quantity of [0, -1, 101, 1.5, "2", null]) {
    const response = await create(
      req("/api/organizations", { ...organizationInput(), quantity }),
    );
    assert.equal(response.status, 400);
  }
  for (const patch of [
    { organizationType: "unknown" },
    { contactEmail: "invalid" },
    { organizationName: " " },
    { contactName: "" },
  ]) {
    assert.equal(
      (
        await create(
          req("/api/organizations", { ...organizationInput(), ...patch }),
        )
      ).status,
      400,
    );
  }
  const g = await group(100);
  const value = await view(g);
  assert.deepEqual(value.seats, {
    total: 100,
    available: 100,
    issued: 0,
    redeemed: 0,
  });
  assert.equal(value.managementKey, undefined);
  assert.equal(value.payment, undefined);
  assert.equal(
    (await stat(path.join(directory, `org-${g.id}.json`))).mode & 0o777,
    0o600,
  );
  assert.ok(
    !(await store.listCollections()).some((c) => c.id === g.id),
    "organization records must not enter the story delivery worker",
  );
});

test("management and gift endpoints reject invalid or interchanged credentials", async () => {
  const g = await group();
  const gift = await issue(g);
  for (const key of ["", "wrong", gift.key]) {
    const result = await managerGet(
      req(`/api/organizations/${g.id}?key=${key}`),
      context(g.id),
    );
    assert.equal(result.status, 404);
    assert.deepEqual(Object.keys(await result.json()), ["error"]);
  }
  for (const key of ["", "wrong", g.key]) {
    const result = await giftGet(
      req(`/api/organizations/${g.id}/gifts/${gift.giftId}?key=${key}`),
      giftContext(g.id, gift.giftId),
    );
    assert.equal(result.status, 404);
  }
  const unauthorized = new NextRequest(
    `http://localhost/api/organizations/${g.id}/gifts?key=wrong`,
    { method: "POST", body: "invalid json" },
  );
  assert.equal((await giftsPost(unauthorized, context(g.id))).status, 404);
  assert.equal(
    unauthorized.bodyUsed,
    false,
    "authorization must precede parsing contacts",
  );
  const other = await group();
  assert.equal(
    (
      await giftGet(
        req(
          `/api/organizations/${other.id}/gifts/${gift.giftId}?key=${gift.key}`,
        ),
        giftContext(other.id, gift.giftId),
      )
    ).status,
    404,
  );
});

test("concurrent allocations cannot exceed the number of free gifts", async () => {
  const g = await group(3);
  const attempts = await Promise.all(
    Array.from({ length: 9 }, (_, index) =>
      giftsPost(
        req(giftsUrl(g), {
          name: `Person ${index}`,
          email: `person${index}@example.com`,
        }),
        context(g.id),
      ),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 3);
  assert.equal(attempts.filter((r) => r.status === 409).length, 6);
  const value = await view(g);
  assert.deepEqual(value.seats, {
    total: 3,
    available: 0,
    issued: 3,
    redeemed: 0,
  });
  assert.equal(
    new Set(value.gifts.map((item: { id: string }) => item.id)).size,
    3,
  );
});

test("revoking an unused gift returns its seat and invalidates redemption", async () => {
  const g = await group(1);
  const gift = await issue(g);
  const revoke = () =>
    giftsPost(
      req(giftsUrl(g), { action: "revoke", giftId: gift.giftId }),
      context(g.id),
    );
  assert.equal((await revoke()).status, 200);
  assert.equal((await revoke()).status, 200);
  const value = await view(g);
  assert.equal(value.seats.available, 1);
  assert.equal(value.gifts[0].status, "revoked");
  assert.equal(value.gifts[0].giftUrl, undefined);
  assert.equal((await redeem(g, gift, shareInput())).status, 409);
  const next = await issue(g);
  assert.notEqual(next.giftId, gift.giftId);
  assert.notEqual(next.key, gift.key);
  const revokedView = await giftGet(
    req(claimUrl(g, gift)),
    giftContext(g.id, gift.giftId),
  );
  assert.equal((await revokedView.json()).status, "revoked");
});

test("concurrent same-token redemption creates one collection and repeat never erases answers", async () => {
  const g = await group(1);
  const gift = await issue(g);
  const input = shareInput();
  const beforeCount = (await store.listCollections()).length;
  const replies = await Promise.all(
    Array.from({ length: 6 }, () => redeem(g, gift, input)),
  );
  assert.ok(replies.every((r) => r.status === 200));
  const bodies = await Promise.all(replies.map((r) => r.json()));
  assert.equal(new Set(bodies.map((b) => b.nextUrl)).size, 1);
  assert.equal((await store.listCollections()).length, beforeCount + 1);
  const link = new URL(bodies[0].nextUrl, "http://localhost");
  const collectionId = link.pathname.split("/").at(-1)!;
  await store.mutateCollection(collectionId, (c) => ({
    ...c,
    invitationNote: "Saved after recording began",
  }));
  const retry = await redeem(g, gift, { claimToken: input.claimToken });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), bodies[0]);
  assert.equal(
    (await store.getCollection(collectionId))!.invitationNote,
    "Saved after recording began",
  );
  assert.equal(
    (
      await giftsPost(
        req(giftsUrl(g), { action: "revoke", giftId: gift.giftId }),
        context(g.id),
      )
    ).status,
    409,
  );
  const value = await view(g);
  assert.deepEqual(value.seats, {
    total: 1,
    available: 0,
    issued: 0,
    redeemed: 1,
  });
  assert.equal(value.gifts[0].giftUrl, undefined);
  assert.equal(value.gifts[0].claim, undefined);
  assert.equal(value.gifts[0].collectionId, undefined);
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes(link.searchParams.get("key")!));
  assert.ok(!serialized.includes(collectionId));
  const stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  assert.equal(
    stored!.gifts[0].claim!.preparedCollection,
    undefined,
    "the contact/address recovery snapshot is removed after success",
  );
});

test("only one of two different claim tokens wins a simultaneous claim", async () => {
  const g = await group(1);
  const gift = await issue(g);
  const attempts = await Promise.all([
    redeem(g, gift, shareInput()),
    redeem(g, gift, shareInput()),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
  const blocked = attempts.find((r) => r.status === 409)!;
  assert.deepEqual(Object.keys(await blocked.json()), ["error"]);
  const later = await redeem(g, gift, shareInput());
  assert.equal(later.status, 409);
  assert.equal((await later.json()).nextUrl, undefined);
  const info = await giftGet(
    req(claimUrl(g, gift)),
    giftContext(g.id, gift.giftId),
  );
  assert.deepEqual(Object.keys(await info.json()).sort(), [
    "email",
    "name",
    "organizationName",
    "status",
  ]);
});

test("invalid collection details leave a gift available to its intended claimant", async () => {
  const g = await group(1);
  const gift = await issue(g);
  const input = shareInput();
  assert.equal(
    (await redeem(g, gift, { ...input, recipient: { name: "No Email" } }))
      .status,
    400,
  );
  assert.equal((await view(g)).gifts[0].status, "issued");
  assert.equal(
    (await redeem(g, gift, { ...input, claimToken: "bad" })).status,
    400,
  );
  assert.equal((await redeem(g, gift, input)).status, 200);
});

test("a saved reservation can recover after a collection write fails", async () => {
  const g = await group(1);
  const gift = await issue(g);
  const input = shareInput();
  const prepared = factory.prepareCollection(input);
  await store.mutateRecord<OrganizationRecord>(`org-${g.id}`, (value) => {
    const item = value!.gifts[0];
    item.status = "redeeming";
    item.claim = {
      tokenHash: createHash("sha256").update(input.claimToken).digest("hex"),
      collectionId: prepared.id,
      preparedCollection: prepared,
    };
    return value!;
  });
  assert.equal(await store.getCollection(prepared.id), null);
  const result = await redeem(g, gift, { claimToken: input.claimToken });
  assert.equal(result.status, 200);
  assert.equal(
    (await result.json()).nextUrl,
    factory.collectionNextUrl(prepared),
  );
  assert.equal((await view(g)).seats.redeemed, 1);
  assert.equal(
    (await store.getCollection(prepared.id))!.ownerKey,
    prepared.ownerKey,
  );
});

test("request redemption preserves the current requester flow without sending anything", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(
      "Free gifting must not call a payment or delivery provider.",
    );
  });
  const g = await group(1);
  const gift = await issue(g);
  const input = {
    ...shareInput(),
    initiationPath: "request",
    requester: { name: "Family Requester", email: "requester@example.com" },
  };
  const response = await redeem(g, gift, input);
  assert.equal(response.status, 200);
  const body = await response.json();
  const link = new URL(body.nextUrl, "http://localhost");
  assert.match(link.pathname, /^\/collection\//);
  const collection = await store.getCollection(
    link.pathname.split("/").at(-1)!,
  );
  assert.equal(link.searchParams.get("key"), collection!.requesterKey);
  assert.notEqual(link.searchParams.get("key"), collection!.ownerKey);
  assert.equal(collection!.status, "invited");
  assert.equal(collection!.notifications[0].status, "pending");
  assert.equal(collection!.notifications[0].sentAt, undefined);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("malformed and oversized organization requests fail without creating a group", async () => {
  const bad = new NextRequest("http://localhost/api/organizations", {
    method: "POST",
    body: "not json",
  });
  assert.equal((await create(bad)).status, 400);
  const huge = new NextRequest("http://localhost/api/organizations", {
    method: "POST",
    body: JSON.stringify({ padding: "x".repeat(65537) }),
  });
  assert.equal((await create(huge)).status, 413);
  const array = await create(req("/api/organizations", []));
  assert.equal(array.status, 400);
});

test("new join invitations store only a digest and replacing an unused link invalidates its predecessor", async () => {
  const g = await group(1);
  const first = await issue(g);
  assert.match(first.url, /^\/join\//);
  let stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  assert.equal(stored!.gifts[0].key, undefined);
  assert.equal(
    stored!.gifts[0].keyHash,
    createHash("sha256").update(first.key).digest("hex"),
  );
  const projection = JSON.stringify(await view(g));
  assert.ok(!projection.includes(first.key));
  assert.ok(!projection.includes(stored!.gifts[0].keyHash!));
  const replaced = await giftsPost(
    req(giftsUrl(g), { action: "replace_link", giftId: first.giftId }),
    context(g.id),
  );
  assert.equal(replaced.status, 200);
  const replacement = parseOrganizationJoinToken(
    (await replaced.json()).giftUrl.split("/").at(-1)!,
  );
  assert.ok(replacement);
  assert.equal(
    (await giftGet(req(claimUrl(g, first)), giftContext(g.id, first.giftId)))
      .status,
    404,
  );
  const second = { ...first, key: replacement.accessKey };
  assert.equal(
    (await giftGet(req(claimUrl(g, second)), giftContext(g.id, second.giftId)))
      .status,
    200,
  );
  assert.equal((await redeem(g, second, shareInput())).status, 200);
  assert.equal(
    (
      await giftsPost(
        req(giftsUrl(g), { action: "replace_link", giftId: first.giftId }),
        context(g.id),
      )
    ).status,
    409,
  );
  stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  assert.equal(stored!.gifts[0].key, undefined);
});

test("assigned recipients require confirmation and cannot be replaced by claim request fields", async () => {
  const g = await group(1);
  const issued = await giftsPost(
    req(giftsUrl(g), {
      name: "Storyteller",
      email: "storyteller@example.com",
      designatedRecipient: {
        name: "Assigned Recipient",
        email: "assigned@example.com",
      },
    }),
    context(g.id),
  );
  assert.equal(issued.status, 201);
  const result = await issued.json();
  const parsed = parseOrganizationJoinToken(result.giftUrl.split("/").at(-1)!);
  assert.ok(parsed);
  const gift = {
    giftId: parsed.giftId,
    key: parsed.accessKey,
    url: result.giftUrl,
  };
  assert.equal((await redeem(g, gift, shareInput())).status, 400);
  const claimed = await redeem(g, gift, {
    ...shareInput(),
    designatedRecipientConfirmed: true,
  });
  assert.equal(claimed.status, 200);
  const stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  const collection = await store.getCollection(
    stored!.gifts[0].claim!.collectionId,
  );
  assert.equal(collection!.recipient.email, "assigned@example.com");
  assert.deepEqual(collection!.sponsorship, {
    organizationId: g.id,
    giftId: gift.giftId,
  });
});

test("sponsors see four chapter states without receiving story text, private contacts or access keys", async () => {
  const g = await group(1);
  const gift = await issue(g);
  await redeem(g, gift, shareInput());
  const stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  const collectionId = stored!.gifts[0].claim!.collectionId;
  await store.mutateCollection(collectionId, (c) => {
    c.takes.push({
      id: "take-one",
      questionId: "q1",
      prompt: "private prompt",
      kind: "text",
      text: "private family answer",
      createdAt: c.createdAt,
    });
    c.chapters.push({
      id: "q2",
      title: "private chapter title",
      content: "private chapter text",
      postcardNote: "private note",
      sourceTakeIds: [],
      videoStatus: "not_requested",
      editorialReviewed: true,
      generatedWith: "source_text",
    });
    c.status = "approved";
    c.deliveries.push({
      chapterId: "q3",
      status: "mailed",
      mailedAt: new Date().toISOString(),
      scheduledFor: c.createdAt,
      providerId: "psc_secret",
    });
    c.deliveries.push({
      chapterId: "q4",
      status: "submitted",
      scheduledFor: c.createdAt,
      providerId: "psc_pending",
    });
    return c;
  });
  const projection = await view(g);
  assert.deepEqual(
    projection.gifts[0].progress.map(
      (chapter: { status: string }) => chapter.status,
    ),
    ["in_progress", "completed", "postcard_shipped", "not_started"],
  );
  const serialized = JSON.stringify(projection);
  for (const secret of [
    "private family answer",
    "private chapter title",
    "private chapter text",
    "psc_secret",
    "psc_pending",
    collectionId,
    "recipient@example.com",
  ])
    assert.ok(!serialized.includes(secret));
  await store.mutateCollection(collectionId, (c) => {
    c.deliveries[0].status = "returned";
    return c;
  });
  const returned = (await view(g)).gifts[0].progress[2];
  assert.notEqual(returned.status, "postcard_shipped");
  assert.equal(returned.mailingAttention, true);
});

test("legacy gift capabilities remain valid and malformed join locators are rejected", async () => {
  const g = await group(1);
  const gift = await issue(g);
  await store.mutateRecord<OrganizationRecord>(`org-${g.id}`, (record) => {
    record!.gifts[0].key = gift.key;
    delete record!.gifts[0].keyHash;
    return record!;
  });
  assert.equal(
    (await giftGet(req(claimUrl(g, gift)), giftContext(g.id, gift.giftId)))
      .status,
    200,
  );
  for (const token of [
    "",
    "../../private",
    `${g.id}.${gift.giftId}.short`,
    `${g.id}.${gift.giftId}.${gift.key}.extra`,
  ])
    assert.equal(parseOrganizationJoinToken(token), null);
});

test("a new donor invitation is emailed, and replacing the link is not", async () => {
  const mail = await import("../src/lib/resend-client");
  mail.clearMockOutbox();
  const g = await group(1);
  const issued = await giftsPost(
    req(giftsUrl(g), {
      name: "Kaelyn",
      email: "donor@example.com",
      designatedRecipient: {
        name: "Sammie",
        email: "sammie@example.com",
      },
    }),
    context(g.id),
  );
  assert.equal(issued.status, 201);
  const body = await issued.json();
  assert.equal(body.invitationDelivery.status, "sent");
  assert.equal(mail.mockOutboxSnapshot().length, 1);
  assert.equal(mail.mockOutboxSnapshot()[0].to, "donor@example.com");
  assert.match(
    mail.mockOutboxSnapshot()[0].subject,
    /Example Church invited you to share the story of your generosity/,
  );
  const giftId = parseOrganizationJoinToken(body.giftUrl.split("/").at(-1)!)!
    .giftId;
  const manager = await view(g);
  assert.equal(manager.gifts[0].invitationDelivery.status, "sent");
  assert.equal(JSON.stringify(manager).includes("invitationSecret"), false);
  const stored = await store.readRecord<OrganizationRecord>(`org-${g.id}`);
  assert.ok(stored!.gifts[0].invitationSecret);
  assert.equal(stored!.gifts[0].key, undefined);
  const replaced = await giftsPost(
    req(giftsUrl(g), { action: "replace_link", giftId }),
    context(g.id),
  );
  assert.equal(replaced.status, 200);
  assert.equal(mail.mockOutboxSnapshot().length, 1);
  assert.equal((await view(g)).gifts[0].invitationDelivery, undefined);
  const resent = await giftsPost(
    req(giftsUrl(g), { action: "resend_invitation", giftId }),
    context(g.id),
  );
  assert.equal(resent.status, 200);
  assert.equal(mail.mockOutboxSnapshot().length, 2);
  assert.equal((await view(g)).gifts[0].invitationDelivery.status, "sent");
});

test("a failed invitation email stays on the gift and the link is still returned", async () => {
  process.env.RESEND_TEST_FAIL = "1";
  try {
    const g = await group(1);
    const gift = await issue(g);
    assert.match(gift.url, /^\/join\//);
    const delivery = (await view(g)).gifts[0].invitationDelivery;
    assert.equal(delivery?.status, "failed");
    assert.match(delivery?.error || "", /Mailbox unavailable/);
  } finally {
    delete process.env.RESEND_TEST_FAIL;
  }
});
