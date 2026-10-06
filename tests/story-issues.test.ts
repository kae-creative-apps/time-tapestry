import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { syntheticRecordedFilmCollection } from "./film-fixture";
import type { Collection } from "../src/lib/collection/types";
import type { StoryCorrection } from "../src/lib/collection/story-issues";
let dir: string;
let store: typeof import("../src/lib/collection/store");
let issues: typeof import("../src/lib/collection/story-issues");
let route: typeof import("../src/app/api/collection/[id]/story-issues/route");
let access: typeof import("../src/lib/collection/access");
let content: typeof import("../src/lib/collection/content");
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tapestry-story-issues-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: dir,
    COLLECTION_EMAIL_ENABLED: "false",
    COLLECTION_DELIVERY_ENABLED: "false",
  });
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "RESEND_API_KEY",
    "LOB_API_KEY",
    "GLOO_API_KEY",
    "ELEVENLABS_API_KEY",
  ])
    delete process.env[key];
  store = await import("../src/lib/collection/store");
  issues = await import("../src/lib/collection/story-issues");
  route = await import("../src/app/api/collection/[id]/story-issues/route");
  access = await import("../src/lib/collection/access");
  content = await import("../src/lib/collection/content");
});
after(() => rm(dir, { recursive: true, force: true }));
function request(
  c: Collection,
  key = c.ownerKey,
  body?: unknown,
  headers = {},
) {
  return new NextRequest(
    `http://localhost/api/collection/${c.id}/story-issues?key=${key}`,
    {
      ...(body === undefined
        ? {}
        : { method: "POST", body: JSON.stringify(body) }),
      headers: { "content-type": "application/json", ...headers },
    },
  );
}
const ctx = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
async function reported() {
  const c = await syntheticRecordedFilmCollection("voice");
  issues.applyStoryIssue(c, { chapterId: "q1", category: "name" });
  await store.putCollection(c);
  return c;
}
async function correction(c: Collection): Promise<StoryCorrection> {
  const input = await issues.storyCorrectionTemplate(
    c.id,
    c.storyIssues![0].id,
  );
  return {
    ...input,
    content: c.takes[0].text + "\n\n" + c.takes[0].text,
    sourceReviewed: true,
    evidence: [
      { takeId: c.takes[0].id, quote: "My grandmother kept a blue notebook" },
    ],
  };
}

test("only owners can report and see issues; stale drafts and cross-origin writes are rejected", async () => {
  const c = await syntheticRecordedFilmCollection("voice");
  const view = await route.GET(request(c), ctx(c));
  assert.equal(view.status, 200);
  assert.match(view.headers.get("cache-control")!, /no-store/);
  const initial = await view.json();
  assert.equal(initial.chapters.length, 4);
  for (const key of [c.recipientKey, c.requesterKey, "wrong-private-key"]) {
    assert.equal((await route.GET(request(c, key), ctx(c))).status, 403);
    assert.equal(
      (
        await route.POST(
          request(c, key, { chapterId: "q1", category: "name" }),
          ctx(c),
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await route.POST(
        request(
          c,
          c.ownerKey,
          { chapterId: "q1", category: "name" },
          { origin: "https://external.test" },
        ),
        ctx(c),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await route.POST(
        request(c, c.ownerKey, {
          chapterId: "q1",
          category: "name",
          expectedChapterHash: "0".repeat(64),
        }),
        ctx(c),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await route.POST(
        request(c, c.ownerKey, {
          chapterId: "q1",
          category: "name",
          content: "Rewrite my story",
        }),
        ctx(c),
      )
    ).status,
    400,
  );
  const payload = {
    chapterId: "q1",
    category: "name",
    expectedChapterHash: initial.chapters[0].hash,
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      route.POST(request(c, c.ownerKey, payload), ctx(c)),
    ),
  );
  assert.ok(results.every((result) => result.status === 200));
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.storyIssues?.length, 1);
  assert.equal(access.publicView(saved, "recipient").storyIssues, undefined);
  assert.equal(access.publicView(saved, "requester").storyIssues, undefined);
  assert.throws(
    () => content.approveCollection(saved),
    /detail is being checked/,
  );
  const withdrawn = await route.POST(
    request(c, c.ownerKey, {
      action: "withdraw",
      issueId: saved.storyIssues![0].id,
    }),
    ctx(c),
  );
  assert.equal(withdrawn.status, 200);
  assert.equal((await withdrawn.json()).issues[0].status, "withdrawn");
  assert.equal(
    (
      await route.POST(
        request(c, c.ownerKey, {
          action: "withdraw",
          issueId: saved.storyIssues![0].id,
        }),
        ctx(c),
      )
    ).status,
    200,
  );
});

test("reporting is bounded and never replaces approved stories", async () => {
  const c = await reported();
  c.status = "approved";
  await store.putCollection(c);
  assert.equal(
    (
      await route.POST(
        request(c, c.ownerKey, { chapterId: "q1", category: "detail" }),
        ctx(c),
      )
    ).status,
    409,
  );
  c.status = "draft";
  c.storyIssues = Array.from({ length: 100 }, (_, i) => ({
    ...c.storyIssues![0],
    id: String(i),
    status: "withdrawn",
  }));
  assert.throws(
    () => issues.applyStoryIssue(c, { chapterId: "q1", category: "detail" }),
    /contact the Time Tapestry team/,
  );
});

test("source-checked correction saves immutable history, resets approval and retries a failed queue safely", async () => {
  const c = await reported();
  const input = await correction(c);
  const originals = structuredClone(c.takes);
  const previousChapters = structuredClone(c.chapters);
  let attempts = 0;
  await assert.rejects(
    issues.resolveStoryIssue(input, {
      queueFilms: async () => {
        attempts++;
        throw new Error("Queue fixture unavailable");
      },
    }),
    /Queue fixture unavailable/,
  );
  const afterSave = (await store.getCollection(c.id))!;
  assert.equal(afterSave.storyIssues![0].status, "resolved");
  assert.deepEqual(afterSave.takes, originals);
  assert.equal(afterSave.chapters[0].content, input.content);
  assert.ok(
    afterSave.chapters.every(
      (chapter) =>
        chapter.videoStatus === "awaiting_edit" &&
        !chapter.editorialReviewed &&
        !chapter.film,
    ),
  );
  const retry = await issues.resolveStoryIssue(input, {
    queueFilms: async (current) => {
      attempts++;
      assert.equal(current.chapters[0].content, input.content);
    },
  });
  assert.equal(attempts, 2);
  assert.equal(retry.filmsRequeued, true);
  const audit = await store.readRecord<{ beforeChapters: unknown }>(
    retry.auditId,
  );
  assert.deepEqual(audit!.beforeChapters, previousChapters);
  const serialized = JSON.stringify(audit);
  assert.equal(serialized.includes(c.ownerKey), false);
  assert.equal(serialized.includes(c.recipient.email), false);
});

test("correction rejects stale or missing evidence and leaves current originals untouched", async () => {
  const c = await reported();
  const input = await correction(c);
  const before = await store.getCollection(c.id);
  for (const update of [
    { expectedSourceHash: "0".repeat(64) },
    { expectedChapterHash: "0".repeat(64) },
    { sourceReviewed: false },
    {
      evidence: [{ takeId: c.takes[0].id, quote: "These words were invented" }],
    },
  ]) {
    await assert.rejects(
      issues.resolveStoryIssue({ ...input, ...update } as StoryCorrection, {
        queueFilms: async () =>
          assert.fail("Must not queue invalid correction"),
      }),
    );
    assert.deepEqual(await store.getCollection(c.id), before);
  }
  c.status = "approved";
  await store.putCollection(c);
  await assert.rejects(
    issues.resolveStoryIssue(input),
    /already been approved/,
  );
});

test("confirming source-correct wording resolves a report without changing or rendering films", async () => {
  const c = await reported();
  const input = await correction(c);
  input.content = c.chapters[0].content;
  const result = await issues.resolveStoryIssue(input, {
    queueFilms: async () => assert.fail("Unchanged wording must not rerender"),
  });
  assert.equal(result.filmsRequeued, false);
  assert.deepEqual(result.collection.chapters, c.chapters);
  assert.equal(result.collection.storyIssues![0].status, "resolved");
});

test("a corrected story queues the real original-recording worker path without a provider call", async () => {
  const c = await reported();
  const input = await correction(c);
  const result = await issues.resolveStoryIssue(input);
  const jobs = await import("../src/lib/collection/films/jobstore");
  const job = await jobs.latestFilmJob(c.id);
  assert.equal(job?.mode, "original");
  assert.equal(job?.preparation, "automatic");
  assert.equal(job?.status, "queued");
  assert.equal(job?.chapters.length, 4);
  assert.equal(job?.chapters[0].content, input.content);
  assert.ok(
    job?.originalSources?.every((source) => source.sourceTakeIds.length > 0),
  );
  const repeated = await issues.resolveStoryIssue(input);
  assert.equal(repeated.auditId, result.auditId);
  assert.equal((await jobs.latestFilmJob(c.id))?.id, job?.id);
});
