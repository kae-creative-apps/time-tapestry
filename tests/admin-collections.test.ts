import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminSession } from "../src/lib/admin-auth";
import type { Collection } from "../src/lib/collection/types";
let directory: string,
  collection: Collection,
  other: Collection,
  mediaId: string;
let store: typeof import("../src/lib/collection/store");
let list: typeof import("../src/app/api/admin/collections/route").GET;
let detail: typeof import("../src/app/api/admin/collections/[id]/route").GET;
let media: typeof import("../src/app/api/admin/collections/[id]/media/[mediaId]/route").GET;
const params = (id: string, mediaId?: string) => ({
  params: Promise.resolve({ id, mediaId: mediaId || "" }),
});
const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    headers: { cookie: `admin_token=${createAdminSession()}`, ...headers },
  });
before(async () => {
  for (const name of ["VERCEL", "KV_REST_API_URL", "KV_REST_API_TOKEN"])
    delete process.env[name];
  process.env.ADMIN_SECRET = "fixture-admin-only";
  directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-admin-"));
  process.env.COLLECTION_DATA_DIR = directory;
  store = await import("../src/lib/collection/store");
  const { prepareCollection } = await import("../src/lib/collection/create");
  const input = {
    initiationPath: "share",
    storyteller: {
      name: "Private storyteller",
      email: "storyteller@example.test",
    },
    recipient: { name: "Private recipient", email: "recipient@example.test" },
  };
  collection = prepareCollection(input);
  other = prepareCollection(input);
  collection.notifications.push({
    id: randomUUID(),
    kind: "invitation",
    to: "recipient@example.test",
    subject: "Your private invitation",
    text: `Secret link ${collection.ownerKey}`,
    url: `https://example.test/record?key=${collection.ownerKey}`,
    dueAt: new Date().toISOString(),
    status: "failed",
    error: `Failed https://example.test/?key=${collection.ownerKey}`,
  });
  await store.putCollection(collection);
  await store.putCollection(other);
  await mkdir(path.join(directory, "media"));
  mediaId = randomUUID();
  const localPath = path.join(directory, "media", mediaId);
  await writeFile(localPath, "0123456789");
  await store.putMedia({
    id: mediaId,
    collectionId: collection.id,
    role: "owner",
    mimeType: "video/webm",
    originalName: 'interview"\r\n.webm',
    bytes: 10,
    createdAt: new Date().toISOString(),
    localPath,
  });
  await store.putMedia({
    id: randomUUID(),
    collectionId: collection.id,
    role: "owner",
    mimeType: "audio/webm",
    originalName: "missing.webm",
    bytes: 25,
    createdAt: new Date().toISOString(),
    localPath: path.join(directory, "media", "missing"),
  });
  list = (await import("../src/app/api/admin/collections/route")).GET;
  detail = (await import("../src/app/api/admin/collections/[id]/route")).GET;
  media = (
    await import("../src/app/api/admin/collections/[id]/media/[mediaId]/route")
  ).GET;
});
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("admin endpoints require signed cookies before accessing content", async () => {
  for (const request of [
    new NextRequest("http://localhost/api/admin/collections"),
    new NextRequest(
      `http://localhost/api/admin/collections?admin_token=${createAdminSession()}`,
    ),
    new NextRequest("http://localhost/api/admin/collections", {
      headers: { cookie: "admin_token=fixture-admin-only" },
    }),
  ]) {
    assert.equal((await list(request)).status, 401);
    assert.equal((await detail(request, params(collection.id))).status, 401);
    assert.equal(
      (await media(request, params(collection.id, mediaId))).status,
      401,
    );
  }
});

test("admin list caps pagination and exposes storage readiness without private links", async () => {
  const response = await list(req("/api/admin/collections?limit=1000"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.limit, 50);
  assert.equal(body.total, 2);
  assert.equal(
    body.items.find((item: { id: string }) => item.id === collection.id).usage
      .usedBytes,
    35,
  );
  assert.equal(body.health.temporaryLocalStorage, true);
  assert.equal(JSON.stringify(body).includes(collection.ownerKey), false);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});

test("admin export omits credential/link fields and marks missing recordings without losing stories", async () => {
  const response = await detail(
    req(`/api/admin/collections/${collection.id}?download=1`),
    params(collection.id),
  );
  assert.equal(response.status, 200);
  const body = await response.json(),
    serialized = JSON.stringify(body);
  for (const value of [
    collection.ownerKey,
    collection.recipientKey,
    collection.requesterKey,
    directory,
    "https://example.test/record",
  ])
    assert.equal(serialized.includes(value), false);
  assert.equal(body.media.length, 2);
  assert.equal(
    body.media.filter(
      (item: { availability: string }) => item.availability === "missing",
    ).length,
    1,
  );
  assert.equal(body.collection.storyteller.email, "storyteller@example.test");
  assert.match(
    response.headers.get("content-disposition") || "",
    /^attachment;/,
  );
});

test("admin media validates collection ownership and streams bounded/suffix ranges", async () => {
  const cross = await media(
    req(`/api/admin/collections/${other.id}/media/${mediaId}`),
    params(other.id, mediaId),
  );
  assert.equal(cross.status, 404);
  const response = await media(
    req(`/api/admin/collections/${collection.id}/media/${mediaId}?download=1`, {
      range: "bytes=2-5",
    }),
    params(collection.id, mediaId),
  );
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(
    response.headers.get("content-disposition")?.includes("\r"),
    false,
  );
  const suffix = await media(
    req("/api/admin/media", { range: "bytes=-3" }),
    params(collection.id, mediaId),
  );
  assert.equal(suffix.status, 206);
  assert.equal(await suffix.text(), "789");
  const invalid = await media(
    req("/api/admin/media", { range: "bytes=20-30" }),
    params(collection.id, mediaId),
  );
  assert.equal(invalid.status, 416);
});

test("admin audit records action/resource/session fingerprint without contact data or credentials", async () => {
  const files = await readdir(path.join(directory, "audit"));
  const events = (
    await Promise.all(
      files.map((name) =>
        readFile(path.join(directory, "audit", name), "utf8"),
      ),
    )
  ).join("");
  assert.ok(events.includes(collection.id));
  assert.ok(events.includes('"action":"export"'));
  for (const value of [
    "Private storyteller",
    "storyteller@example.test",
    "fixture-admin-only",
    collection.ownerKey,
  ])
    assert.equal(events.includes(value), false);
});
