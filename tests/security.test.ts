import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  createAdminSession,
  verifyAdminSecret,
  verifyAdminToken,
  getAdminTokenFromRequest,
} from "../src/lib/admin-auth";
let directory: string;
let rate: typeof import("../src/lib/security/rate-limit");
let usage: typeof import("../src/lib/collection/usage");
let policy: typeof import("../src/lib/security/policy");
let human: typeof import("../src/lib/security/human");
let http: typeof import("../src/lib/security/http");
const rejectsStatus = (status: number) => (error: unknown) =>
  error instanceof Error && "status" in error && error.status === status;
before(async () => {
  for (const name of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "SECURITY_TEST_BYPASS",
    "SECURITY_LOCAL_BYPASS",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_APP_URL",
  ])
    delete process.env[name];
  Object.assign(process.env, {
    NODE_ENV: "test",
    ADMIN_SECRET: "fixture-admin-secret-not-for-deployment",
    COLLECTION_STORAGE_LIMIT_BYTES: String(512 * 1024 * 1024),
  });
  directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-security-"));
  process.env.COLLECTION_DATA_DIR = directory;
  rate = await import("../src/lib/security/rate-limit");
  usage = await import("../src/lib/collection/usage");
  policy = await import("../src/lib/security/policy");
  human = await import("../src/lib/security/human");
  http = await import("../src/lib/security/http");
});
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("admin sessions expire and reject raw secrets, query tokens and tampering", () => {
  const now = Date.now(),
    token = createAdminSession(now);
  assert.equal(verifyAdminSecret(process.env.ADMIN_SECRET), true);
  assert.equal(verifyAdminSecret("incorrect"), false);
  assert.equal(verifyAdminToken(token, now), true);
  assert.equal(verifyAdminToken(process.env.ADMIN_SECRET), false);
  assert.equal(verifyAdminToken(`${token.slice(0, -4)}xxxx`, now), false);
  assert.equal(verifyAdminToken(token, now + 7 * 86400_000), false);
  assert.equal(
    getAdminTokenFromRequest(
      new NextRequest(`http://localhost/?admin_token=${token}`),
    ),
    undefined,
  );
  assert.equal(
    getAdminTokenFromRequest(
      new NextRequest("http://localhost/", {
        headers: { cookie: `admin_token=${token}` },
      }),
    ),
    token,
  );
  delete process.env.ADMIN_SECRET;
  assert.equal(verifyAdminToken(token), false);
  assert.throws(() => createAdminSession());
  process.env.ADMIN_SECRET = "fixture-admin-secret-not-for-deployment";
});

test("local rate counter serializes concurrent calls and resets after its window", async () => {
  const key = randomUUID(),
    now = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => rate.consumeLimit(key, 3, 60, now)),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 3);
  for (const result of results)
    if (result.status === "rejected") assert.equal(result.reason.status, 429);
  await rate.consumeLimit(key, 3, 60, now + 60_001);
});

test("untrusted proxy headers cannot evade a hosted bucket; Vercel requires an IP", () => {
  const a = new NextRequest("https://example.test/", {
    headers: { "x-forwarded-for": "192.0.2.1" },
  });
  const b = new NextRequest("https://example.test/", {
    headers: { "x-forwarded-for": "192.0.2.2" },
  });
  assert.equal(rate.clientBucket(a), rate.clientBucket(b));
  process.env.VERCEL = "1";
  try {
    assert.notEqual(rate.clientBucket(a), rate.clientBucket(b));
    assert.throws(
      () => rate.clientBucket(new NextRequest("https://example.test/")),
      rejectsStatus(503),
    );
    process.env.SECURITY_LOCAL_BYPASS = "true";
    assert.equal(
      policy.localSecurityBypass(new NextRequest("http://localhost/")),
      false,
    );
  } finally {
    delete process.env.VERCEL;
    delete process.env.SECURITY_LOCAL_BYPASS;
  }
});

test("hosted changes fail closed without verification/storage and cross-origin changes are rejected", async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
  const guard = await import("../src/lib/security/request");
  await assert.rejects(
    guard.guardRequest(
      new NextRequest("https://example.test/", {
        headers: { origin: "https://example.test" },
      }),
      { action: "create_collection" },
    ),
    rejectsStatus(503),
  );
  assert.throws(
    () =>
      policy.assertOrigin(
        new NextRequest("https://example.test/", {
          headers: { origin: "https://attacker.test" },
        }),
      ),
    rejectsStatus(403),
  );
  assert.throws(
    () => policy.assertOrigin(new NextRequest("https://example.test/")),
    rejectsStatus(403),
  );
});

test("human verification checks action, hostname, age and replay before granting access", async (t) => {
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
  process.env.TURNSTILE_SECRET_KEY = "fixture-only";
  const req = new NextRequest("https://example.test/");
  let result = {
    success: true,
    hostname: "example.test",
    action: "create_collection",
    challenge_ts: new Date().toISOString(),
  };
  t.mock.method(globalThis, "fetch", async () => Response.json(result));
  await human.verifyHuman(req, "single-use-fixture-token", "create_collection");
  await assert.rejects(
    human.verifyHuman(req, "single-use-fixture-token", "create_collection"),
    rejectsStatus(400),
  );
  result = { ...result, action: "contact" };
  await assert.rejects(
    human.verifyHuman(req, "wrong-action", "create_collection"),
    rejectsStatus(400),
  );
  result = {
    ...result,
    action: "create_collection",
    hostname: "attacker.test",
  };
  await assert.rejects(
    human.verifyHuman(req, "wrong-host", "create_collection"),
    rejectsStatus(400),
  );
  result = {
    ...result,
    hostname: "example.test",
    challenge_ts: new Date(Date.now() - 301_000).toISOString(),
  };
  await assert.rejects(
    human.verifyHuman(req, "expired", "create_collection"),
    rejectsStatus(400),
  );
});

test("upload reservations prevent concurrent quota overspend and are idempotent", async () => {
  const collectionId = randomUUID(),
    ids = [randomUUID(), randomUUID()];
  const bytes = 300 * 1024 * 1024;
  const results = await Promise.allSettled(
    ids.map((mediaId) =>
      usage.reserveMediaUpload({ collectionId, mediaId, bytes }),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const successful = results.findIndex((x) => x.status === "fulfilled"),
    mediaId = ids[successful];
  await usage.reserveMediaUpload({ collectionId, mediaId, bytes });
  assert.equal(
    (await usage.getCollectionUsage(collectionId)).reservedBytes,
    bytes,
  );
  await assert.rejects(
    usage.finalizeMediaUpload({ collectionId, mediaId, bytes: bytes + 1 }),
    rejectsStatus(413),
  );
  await usage.finalizeMediaUpload({
    collectionId,
    mediaId,
    bytes: bytes - 100,
  });
  await usage.finalizeMediaUpload({
    collectionId,
    mediaId,
    bytes: bytes - 100,
  });
  await usage.releaseMediaReservation({ collectionId, mediaId });
  const view = await usage.getCollectionUsage(collectionId);
  assert.equal(view.usedBytes, bytes - 100);
  assert.equal(view.reservedBytes, 0);
  assert.equal(view.limitBytes, 512 * 1024 * 1024);
  await assert.rejects(
    usage.reserveMediaUpload({
      collectionId,
      mediaId: randomUUID(),
      bytes: 513 * 1024 * 1024,
    }),
    rejectsStatus(413),
  );
});

test("failed reservation can be released without deleting finalized media", async () => {
  const collectionId = randomUUID(),
    mediaId = randomUUID();
  await usage.reserveMediaUpload({ collectionId, mediaId, bytes: 1000 });
  await usage.releaseMediaReservation({ collectionId, mediaId });
  assert.equal((await usage.getCollectionUsage(collectionId)).reservedBytes, 0);
  process.env.COLLECTION_STORAGE_LIMIT_BYTES = String(10 * 1024 * 1024 * 1024);
  assert.equal(
    (await usage.getCollectionUsage(collectionId)).limitBytes,
    10 * 1024 * 1024 * 1024,
  );
  process.env.COLLECTION_STORAGE_LIMIT_BYTES = String(512 * 1024 * 1024);
});

test("JSON and multipart body streams are bounded even without Content-Length", async () => {
  await assert.rejects(
    http.readJsonBody(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ value: "x".repeat(100) }),
      }),
      30,
    ),
    rejectsStatus(413),
  );
  const multipart =
    '--fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture.webm"\r\nContent-Type: video/webm\r\n\r\n' +
    "x".repeat(100) +
    "\r\n--fixture--\r\n";
  await assert.rejects(
    http.readFormBody(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=fixture" },
        body: multipart,
      }),
      30,
    ),
    rejectsStatus(413),
  );
});

test("unauthorized paid endpoints reject before touching providers", async (t) => {
  const store = await import("../src/lib/collection/store");
  const prepare = await import("../src/lib/collection/create");
  const prepared = prepare.prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Fixture", email: "fixture@example.test" },
    recipient: { name: "Fixture", email: "recipient@example.test" },
  });
  await store.putCollection(prepared);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Unexpected provider request");
  });
  for (const route of ["conversation/session", "speak", "transcribe"]) {
    const mod = await import(`../src/app/api/collection/[id]/${route}/route`);
    const response = await mod.POST(
      new NextRequest(
        `http://localhost/api/collection/${prepared.id}/${route}?key=wrong`,
        { method: "POST", body: "not-json" },
      ),
      { params: Promise.resolve({ id: prepared.id }) },
    );
    assert.ok([403, 404].includes(response.status), `${route} rejected`);
  }
  assert.equal(calls, 0);
});

test("corrupted stored URLs are rejected before any authenticated Blob request", async (t) => {
  const { mediaBytes, assertPrivateBlobUrl } =
    await import("../src/lib/collection/media");
  const store = await import("../src/lib/collection/store");
  const { prepareCollection } = await import("../src/lib/collection/create");
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Fixture", email: "fixture@example.test" },
    recipient: { name: "Fixture", email: "recipient@example.test" },
  });
  await store.putCollection(c);
  const route =
    await import("../src/app/api/collection/[id]/media/[mediaId]/route");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("Must reject before requesting storage");
  });
  for (const url of [
    "http://127.0.0.1/private",
    "https://bucket.private.blob.vercel-storage.com.evil.test/video",
    "https://evil.test/?next=.private.blob.vercel-storage.com/",
    "https://user:pass@bucket.private.blob.vercel-storage.com/video",
    "file:///etc/passwd",
  ]) {
    const record = {
      id: randomUUID(),
      collectionId: c.id,
      role: "owner" as const,
      mimeType: "video/webm",
      originalName: "fixture.webm",
      bytes: 10,
      createdAt: new Date().toISOString(),
      url,
    };
    await store.putMedia(record);
    await assert.rejects(mediaBytes(record), /Invalid private/);
    const response = await route.GET(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/media/${record.id}?key=${c.ownerKey}`,
      ),
      { params: Promise.resolve({ id: c.id, mediaId: record.id }) },
    );
    assert.equal(response.status, 503);
  }
  assertPrivateBlobUrl(
    "https://bucket-name.private.blob.vercel-storage.com/collections/fixture/file.mp4",
  );
  assert.equal(requests, 0);
});

test("metadata cap rejects both direct and locked oversized writes without truncating prior records", async () => {
  const store = await import("../src/lib/collection/store");
  const key = `metadata-${randomUUID()}`,
    original = { message: "Original story remains saved" };
  process.env.COLLECTION_METADATA_LIMIT_BYTES = "1024";
  try {
    await store.writeRecord(key, original);
    await assert.rejects(
      store.writeRecord(key, { message: "x".repeat(1024) }),
      rejectsStatus(413),
    );
    await assert.rejects(
      store.mutateRecord(key, () => ({ message: "y".repeat(1024) })),
      rejectsStatus(413),
    );
    assert.deepEqual(await store.readRecord(key), original);
    process.env.COLLECTION_METADATA_LIMIT_BYTES = "4096";
    await store.mutateRecord(key, () => ({ message: "z".repeat(2048) }));
    process.env.COLLECTION_METADATA_LIMIT_BYTES = "1024";
    assert.equal(
      (await store.readRecord<{ message: string }>(key))!.message.length,
      2048,
      "Previously saved records remain readable after a lower policy",
    );
  } finally {
    delete process.env.COLLECTION_METADATA_LIMIT_BYTES;
  }
});

test("locked KV metadata commit is rejected before an oversized replacement can be sent", async (t) => {
  const store = await import("../src/lib/collection/store");
  process.env.KV_REST_API_URL = "https://fixture.invalid";
  process.env.KV_REST_API_TOKEN = "fixture-token";
  process.env.COLLECTION_METADATA_LIMIT_BYTES = "1024";
  try {
    const original = { message: "Saved cloud story" };
    let commits = 0,
      unlocks = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const text =
          typeof init?.body === "string"
            ? init.body
            : input instanceof Request
              ? await input.text()
              : "";
        const payload = JSON.parse(text);
        const response = (command: unknown[]) => {
          const name = String(command[0]).toLowerCase();
          if (name === "set") return { result: "OK" };
          if (name === "get") return { result: JSON.stringify(original) };
          if (name === "eval") {
            if (String(command[1]).includes("redis.call('set'")) commits++;
            else unlocks++;
            return { result: 1 };
          }
          throw new Error("Unexpected fixture command");
        };
        return Response.json(
          Array.isArray(payload[0]) ? payload.map(response) : response(payload),
        );
      },
    );
    await assert.rejects(
      store.mutateRecord(`metadata-${randomUUID()}`, () => ({
        message: "x".repeat(1024),
      })),
      rejectsStatus(413),
    );
    assert.equal(commits, 0);
    assert.equal(unlocks, 1);
    assert.deepEqual(original, { message: "Saved cloud story" });
  } finally {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.COLLECTION_METADATA_LIMIT_BYTES;
  }
});
