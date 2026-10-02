import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Collection } from "../src/lib/collection/types";

const adminSecret = "legacy-regression-test-secret";
let directory: string;
let collectionPost: typeof import("../src/app/api/collection/[id]/route").POST;
let store: typeof import("../src/lib/collection/store");
let withLegacyAdmin: typeof import("../src/lib/legacy-access").withLegacyAdmin;

before(async () => {
  for (const key of [
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL",
  ]) {
    delete process.env[key];
  }
  process.env.ADMIN_SECRET = adminSecret;
  directory = await mkdtemp(path.join(os.tmpdir(), "tapestry-regressions-"));
  process.env.COLLECTION_DATA_DIR = directory;
  collectionPost = (await import("../src/app/api/collection/[id]/route")).POST;
  store = await import("../src/lib/collection/store");
  withLegacyAdmin = (await import("../src/lib/legacy-access")).withLegacyAdmin;
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

const legacyRoutes = [
  { path: "session/[id]", method: "GET" },
  { path: "session/create", method: "POST" },
  { path: "interview/turn", method: "POST" },
  { path: "story/generate", method: "POST" },
  { path: "reply/submit", method: "POST" },
  { path: "video/upload", method: "POST" },
  { path: "video/upload-url", method: "POST" },
  { path: "postcards/send", method: "POST" },
  { path: "email/send", method: "POST" },
  { path: "email/test", method: "POST" },
  { path: "email/nudge", method: "POST" },
] as const;

for (const route of legacyRoutes) {
  test(`legacy ${route.method} /api/${route.path} rejects public access before handling input`, async (t) => {
    let externalRequests = 0;
    t.mock.method(globalThis, "fetch", async () => {
      externalRequests += 1;
      throw new Error("A rejected legacy request must not reach a provider.");
    });
    const module = await import(`../src/app/api/${route.path}/route`);
    const handler = module[route.method];
    assert.equal(typeof handler, "function");

    for (const credential of ["missing", "invalid-cookie", "query-only"]) {
      const query =
        credential === "query-only" ? `?admin_token=${adminSecret}` : "";
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (credential === "invalid-cookie")
        headers.cookie = "admin_token=incorrect-secret";
      const request = new NextRequest(
        `http://localhost/api/${route.path.replace("[id]", "legacy-session")}${query}`,
        {
          method: route.method,
          headers,
          ...(route.method === "POST" ? { body: "not-json" } : {}),
        },
      );
      const response = await handler(request, {
        params: Promise.resolve({ id: "legacy-session" }),
      });
      assert.equal(response.status, 401, credential);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match((await response.json()).error, /admin access/i);
      assert.equal(
        request.bodyUsed,
        false,
        "Authorization must precede request parsing.",
      );
    }
    assert.equal(externalRequests, 0);
  });
}

test("legacy guard delegates an authenticated request once and preserves its arguments", async () => {
  let calls = 0;
  const context = { params: Promise.resolve({ id: "archived-session" }) };
  const guarded = withLegacyAdmin(
    async (request: NextRequest, received: typeof context) => {
      calls += 1;
      assert.equal(received, context);
      return NextResponse.json(
        { input: await request.json() },
        { status: 202 },
      );
    },
  );
  const request = new NextRequest("http://localhost/api/archived-tool", {
    method: "POST",
    headers: {
      cookie: `admin_token=${adminSecret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: "An authenticated archived operation" }),
  });
  const response = await guarded(request, context);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    input: { message: "An authenticated archived operation" },
  });
  assert.equal(calls, 1);
});

test("legacy guard fails closed when no admin secret is configured", async () => {
  const saved = process.env.ADMIN_SECRET;
  let calls = 0;
  const guarded = withLegacyAdmin(async (_request: NextRequest) => {
    calls += 1;
    return NextResponse.json({ ok: true });
  });
  try {
    delete process.env.ADMIN_SECRET;
    const response = await guarded(
      new NextRequest("http://localhost/api/archived-tool", {
        headers: { cookie: `admin_token=${adminSecret}` },
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = saved;
  }
});

async function fixture(
  status: Collection["status"] = "draft",
): Promise<Collection> {
  const now = new Date().toISOString();
  const c: Collection = {
    schemaVersion: 2,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status,
    ownerKey: randomUUID(),
    recipientKey: randomUUID(),
    requesterKey: randomUUID(),
    initiationPath: "share",
    storyteller: { name: "Storyteller", email: "storyteller@example.test" },
    recipient: { name: "Recipient", email: "recipient@example.test" },
    requester: { name: "Storyteller", email: "storyteller@example.test" },
    addressConfirmed: false,
    invitationNote: "",
    faithFraming: "faith",
    currentQuestion: 3,
    chapterBlessings: {
      q1: {
        encouragement: "Keep this original encouragement.",
        scriptureReference: "",
        scriptureText: "",
        scriptureTranslation: "",
      },
    },
    takes: [],
    selectedTakeIds: {},
    followUps: {},
    chapters: [1, 2, 3, 4].map((index) => ({
      id: `q${index}`,
      title: `Chapter ${index}`,
      content: "Keep this original story.",
      postcardNote: "Keep this original postcard note.",
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
  };
  await store.putCollection(c);
  return c;
}

async function post(c: Collection, body: unknown, key = c.ownerKey) {
  return collectionPost(
    new NextRequest(`http://localhost/api/collection/${c.id}?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: c.id }) },
  );
}

const chapterEdit = (content: string) => ({
  action: "edit_chapter",
  chapterId: "q1",
  title: "A revised title",
  content,
  postcardNote: "A revised postcard note.",
  editorialReviewed: true,
  blessing: {
    encouragement: "A revised encouragement.",
    scriptureReference: "",
    scriptureText: "",
    scriptureTranslation: "",
  },
});

test("an oversized chapter is rejected without changing story, review or encouragement", async () => {
  const c = await fixture();
  const response = await post(c, chapterEdit("x".repeat(100001)));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /100,000 characters/);
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("a chapter at the supported limit is preserved beyond the former 30,000-character cutoff", async () => {
  const c = await fixture();
  const content = "x".repeat(99999) + "Z";
  const response = await post(c, chapterEdit(content));
  assert.equal(response.status, 200);
  const saved = await store.getCollection(c.id);
  assert.equal(saved?.chapters[0].content, content);
  assert.equal(
    saved?.chapterBlessings.q1.encouragement,
    "A revised encouragement.",
  );
});

test("an oversized recipient reply is rejected without saving a partial message or queuing email", async () => {
  const c = await fixture("approved");
  const response = await post(
    c,
    {
      action: "reply",
      chapterId: "q1",
      replyId: randomUUID(),
      text: "x".repeat(30001),
    },
    c.recipientKey,
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /30,000 characters/);
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("a reply at the supported limit keeps its last character and queues one notification", async () => {
  const c = await fixture("approved");
  const text = "x".repeat(29999) + "Z";
  const response = await post(
    c,
    {
      action: "reply",
      chapterId: "q1",
      replyId: randomUUID(),
      text,
    },
    c.recipientKey,
  );
  assert.equal(response.status, 200);
  const saved = await store.getCollection(c.id);
  assert.equal(saved?.replies.length, 1);
  assert.equal(saved?.replies[0].text, text);
  assert.equal(saved?.notifications.length, 1);
  assert.equal(saved?.notifications[0].kind, "reply_received");
  assert.equal(saved?.notifications[0].status, "pending");
});
