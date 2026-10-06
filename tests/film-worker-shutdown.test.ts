import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, test, type TestContext } from "node:test";
import { syntheticRecordedFilmCollection } from "./film-fixture";
import type { StoryFilmJob } from "../src/lib/collection/films/types";

let store: typeof import("../src/lib/collection/store");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let worker: typeof import("../src/lib/collection/films/worker");
const fixtureJobs: string[] = [];

before(async () => {
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "ELEVENLABS_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
  ])
    delete process.env[key];
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  process.env.COLLECTION_DATA_DIR = await fs.mkdtemp(
    path.join(os.tmpdir(), "film-worker-shutdown-"),
  );
  store = await import("../src/lib/collection/store");
  jobs = await import("../src/lib/collection/films/jobstore");
  worker = await import("../src/lib/collection/films/worker");
});

afterEach(async (t) => {
  if ("mock" in t) t.mock.restoreAll();
  syncBuiltinESMExports();
  for (const id of fixtureJobs.splice(0))
    await store.mutateRecord<StoryFilmJob>(id, (job) => ({
      ...job!,
      status: "failed",
      lease: undefined,
    }));
});

after(async () => {
  await fs.rm(store.dataRoot, { recursive: true, force: true });
});

async function queuedJob() {
  const collection = await syntheticRecordedFilmCollection();
  await store.putCollection(collection);
  const job = await jobs.enqueueAutomaticOriginalFilms(collection, {
    processingApproved: true,
  });
  fixtureJobs.push(job.id);
  return job;
}

function restoreBuiltins(t: TestContext) {
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
}

async function assertUnclaimed(job: StoryFilmJob) {
  const current = await jobs.getFilmJob(job.id);
  assert.equal(current?.status, "queued");
  assert.equal(current?.attempts, job.attempts);
  assert.equal(current?.lease, undefined);
  assert.deepEqual(current?.chapters, job.chapters);
}

test("an already stopped worker does not start a heartbeat or claim", async (t) => {
  const job = await queuedJob();
  const opening = t.mock.method(fs, "open", async () => {
    throw new Error("Stopped workers must not open storage locks.");
  });
  restoreBuiltins(t);
  assert.equal(
    await worker.runFilmWorkerOnce("stopped-worker", {
      shouldStop: () => true,
    }),
    null,
  );
  assert.equal(opening.mock.callCount(), 0);
  await assertUnclaimed(job);
});

test("shutdown during the queue read prevents a fresh claim", async (t) => {
  const job = await queuedJob();
  const original = fs.readFile;
  let stopping = false;
  t.mock.method(
    fs,
    "readFile",
    async (...args: Parameters<typeof fs.readFile>) => {
      const result = await original(...args);
      if (
        String(args[0]) ===
        path.join(store.dataRoot, "story-film-registry.json")
      )
        stopping = true;
      return result;
    },
  );
  restoreBuiltins(t);
  assert.equal(
    await worker.runFilmWorkerOnce("queue-stop-worker", {
      shouldStop: () => stopping,
    }),
    null,
  );
  assert.equal(stopping, true);
  await assertUnclaimed(job);
});

test("shutdown during the locked capacity check leaves the attempt untouched", async (t) => {
  const job = await queuedJob();
  const original = fs.statfs;
  let checks = 0;
  let stopping = false;
  t.mock.method(fs, "statfs", async (...args: Parameters<typeof fs.statfs>) => {
    const result = await original(...args);
    if (++checks === 2) stopping = true;
    return result;
  });
  restoreBuiltins(t);
  assert.equal(
    await worker.runFilmWorkerOnce("capacity-stop-worker", {
      shouldStop: () => stopping,
    }),
    null,
  );
  assert.equal(checks, 2);
  await assertUnclaimed(job);
});

function stopAfterClaimPersistence(
  t: TestContext,
  job: StoryFilmJob,
  beforeStop?: (persisted: StoryFilmJob) => StoryFilmJob,
) {
  const original = fs.rename;
  let stopping = false;
  const destination = path.join(store.dataRoot, `${job.id}.json`);
  t.mock.method(fs, "rename", async (...args: Parameters<typeof fs.rename>) => {
    const result = await original(...args);
    if (!stopping && String(args[1]) === destination) {
      const claimed = JSON.parse(
        await fs.readFile(destination, "utf8"),
      ) as StoryFilmJob;
      assert.ok(claimed.lease);
      if (beforeStop)
        await fs.writeFile(destination, JSON.stringify(beforeStop(claimed)));
      stopping = true;
    }
    return result;
  });
  restoreBuiltins(t);
  return () => stopping;
}

test("shutdown after claim persistence refunds the attempt without starting processing", async (t) => {
  const job = await queuedJob();
  const shouldStop = stopAfterClaimPersistence(t, job);
  assert.equal(
    await worker.runFilmWorkerOnce("claimed-stop-worker", { shouldStop }),
    null,
  );
  assert.equal(shouldStop(), true);
  await assertUnclaimed(job);
});

test("shutdown cannot release or refund a replacement worker's lease", async (t) => {
  const job = await queuedJob();
  const replacementToken = "synthetic-replacement-owner";
  const shouldStop = stopAfterClaimPersistence(t, job, (claimed) => ({
    ...claimed,
    attempts: 2,
    lease: { token: replacementToken, expiresAt: Date.now() + 120000 },
  }));
  assert.equal(
    await worker.runFilmWorkerOnce("replaced-stop-worker", { shouldStop }),
    null,
  );
  const current = await jobs.getFilmJob(job.id);
  assert.equal(current?.status, "preparing");
  assert.equal(current?.attempts, 2);
  assert.equal(current?.lease?.token, replacementToken);
});

test("shutdown cannot refund an expired claim", async (t) => {
  const job = await queuedJob();
  const shouldStop = stopAfterClaimPersistence(t, job, (claimed) => ({
    ...claimed,
    lease: { ...claimed.lease!, expiresAt: 1 },
  }));
  assert.equal(
    await worker.runFilmWorkerOnce("expired-stop-worker", { shouldStop }),
    null,
  );
  const current = await jobs.getFilmJob(job.id);
  assert.equal(current?.status, "preparing");
  assert.equal(current?.attempts, 1);
  assert.equal(current?.lease?.expiresAt, 1);
});
