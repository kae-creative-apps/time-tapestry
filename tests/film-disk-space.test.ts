import { before, afterEach, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdir, mkdtemp, readFile, statfs, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import {
  assertFilmDiskSpace,
  FilmDiskSpaceError,
  filmMinimumFreeBytes,
  filmRenderScratchBytes,
  filmSourceScratchBytes,
} from "../src/lib/collection/films/disk-space";
import { syntheticFilmCollection, testVoice } from "./film-fixture";

let store: typeof import("../src/lib/collection/store");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let worker: typeof import("../src/lib/collection/films/worker");
const fixtureJobIds: string[] = [];

before(async () => {
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "ELEVENLABS_API_KEY",
    "BLOB_READ_WRITE_TOKEN",
    "STORY_FILM_MIN_FREE_BYTES",
  ])
    delete process.env[key];
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "film-disk-space-tests-"),
  );
  store = await import("../src/lib/collection/store");
  jobs = await import("../src/lib/collection/films/jobstore");
  worker = await import("../src/lib/collection/films/worker");
});
afterEach(async () => {
  delete process.env.STORY_FILM_MIN_FREE_BYTES;
  for (const id of fixtureJobIds.splice(0))
    await store.mutateRecord(id, async () => ({
      ...(await jobs.getFilmJob(id))!,
      status: "failed",
      lease: undefined,
    }));
});

async function originalJob(sourceBytes = 18) {
  const c = syntheticFilmCollection();
  for (const take of c.takes) {
    take.kind = "video";
    take.mediaId = `original_${take.id}`;
    take.durationSeconds = 12;
    await store.putMedia({
      id: take.mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "synthetic.mp4",
      bytes: sourceBytes,
      createdAt: c.createdAt,
      // Deliberately absent. Capacity rejection must precede any media read.
      localPath: path.join(store.dataRoot, "must-not-read.mp4"),
    });
  }
  await store.putCollection(c);
  const job = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  fixtureJobIds.push(job.id);
  return job;
}

function changeSourceAfterInputCheck(
  t: TestContext,
  mediaId: string,
  read: () => string,
) {
  const original = fs.readFile;
  const file = path.join(store.dataRoot, `media-${mediaId}.json`);
  let sourceReads = 0;
  t.mock.method(
    fs,
    "readFile",
    async (...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]) === file && ++sourceReads > 1) return read();
      return original(...args);
    },
  );
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
}

test("disk capacity uses available blocks and preserves the configured floor", async () => {
  assert.equal(filmMinimumFreeBytes(), 1024 ** 3);
  process.env.STORY_FILM_MIN_FREE_BYTES = "1024";
  await assert.rejects(
    assertFilmDiskSpace("/synthetic", 1024, async () => ({
      bavail: 1,
      bsize: 1024,
    })),
    FilmDiskSpaceError,
  );
  const result = await assertFilmDiskSpace("/synthetic", 1024, async () => ({
    bavail: 2,
    bsize: 1024,
  }));
  assert.equal(result.availableBytes, result.requiredBytes);
  await assert.rejects(
    assertFilmDiskSpace("/synthetic", 0, async () => {
      throw new Error("Unavailable filesystem");
    }),
    /could not be checked/,
  );
  process.env.STORY_FILM_MIN_FREE_BYTES = "disabled";
  assert.throws(filmMinimumFreeBytes, /positive integer/);
});

test("source estimates cover copies and PCM expansion, with an unknown-duration reserve", () => {
  const source = { bytes: 1024, durationMs: 60000 };
  const estimated = filmSourceScratchBytes([source]);
  assert.ok(estimated > source.bytes * 2 + 60000 * 192);
  assert.ok(
    filmSourceScratchBytes([{ ...source, durationMs: null }]) > estimated,
  );
  assert.equal(filmSourceScratchBytes([]), 0);
  assert.ok(filmRenderScratchBytes(120) > 120 * 1024 ** 2);
  assert.throws(() => filmRenderScratchBytes(NaN), FilmDiskSpaceError);
});

test("real local statfs works without a Railway volume", async () => {
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  const result = await assertFilmDiskSpace(store.dataRoot);
  assert.ok(result.availableBytes > 0);
});

test("persistent low disk never claims a queued job or consumes its retry budget", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueStoryFilms(c, true, {
    resolveVoice: async () => testVoice,
  });
  process.env.STORY_FILM_MIN_FREE_BYTES = String(
    Math.floor(Number.MAX_SAFE_INTEGER / 2),
  );
  for (let attempt = 0; attempt < 3; attempt++)
    assert.equal(await worker.runFilmWorkerOnce("disk-test"), null);
  const untouched = await jobs.getFilmJob(queued.id);
  assert.equal(untouched?.status, "queued");
  assert.equal(untouched?.attempts, 0);
  assert.equal(untouched?.lease, undefined);
  // Keep subsequent worker tests focused on their own queued job.
  await store.mutateRecord(queued.id, () => ({
    ...untouched!,
    status: "failed",
  }));
});

test("source capacity is checked under the claim lock before media reads", async () => {
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  const disk = await statfs(store.dataRoot);
  const needed = disk.bavail * disk.bsize;
  const queued = await originalJob(needed);
  await assertFilmDiskSpace(store.dataRoot);
  assert.equal(await worker.runFilmWorkerOnce("disk-test"), null);
  const untouched = await jobs.getFilmJob(queued.id);
  assert.equal(untouched?.status, "queued");
  assert.equal(untouched?.attempts, 0);
  assert.equal(untouched?.lease, undefined);
});

test("a claimed low-disk job is safely deferred, retaining files and retry budget", async () => {
  const queued = await originalJob();
  const claimed = (await jobs.claimNextFilmJob(
    "disk-test",
    Date.now(),
    queued.id,
  ))!;
  const directory = path.join(store.dataRoot, "film-work", claimed.id);
  await mkdir(directory, { recursive: true });
  const saved = path.join(directory, "preserved-original.bin");
  await writeFile(saved, "original bytes");
  process.env.STORY_FILM_MIN_FREE_BYTES = String(
    Math.floor(Number.MAX_SAFE_INTEGER / 2),
  );
  let transcribed = false;
  const paused = await worker.processFilmJob(claimed, {
    transcribe: async () => {
      transcribed = true;
      throw new Error("A provider must never be called on low disk.");
    },
  });
  assert.equal(transcribed, false);
  assert.equal(paused?.status, "queued");
  assert.equal(paused?.attempts, 0);
  assert.equal(paused?.lease, undefined);
  assert.ok(Date.parse(paused!.nextAttemptAt!) > Date.now());
  assert.match(paused!.error!, /paused for disk space/);
  assert.equal(await readFile(saved, "utf8"), "original bytes");
});

test("an old worker cannot release or refund a replacement worker's lease", async () => {
  const queued = await originalJob();
  const claimed = (await jobs.claimNextFilmJob(
    "old-worker",
    Date.now(),
    queued.id,
  ))!;
  const replacementToken = "replacement-worker-token";
  await store.mutateRecord(claimed.id, () => ({
    ...claimed,
    attempts: 2,
    lease: { token: replacementToken, expiresAt: Date.now() + 120000 },
  }));
  process.env.STORY_FILM_MIN_FREE_BYTES = String(
    Math.floor(Number.MAX_SAFE_INTEGER / 2),
  );
  await worker.processFilmJob(claimed);
  const current = await jobs.getFilmJob(claimed.id);
  assert.equal(current?.lease?.token, replacementToken);
  assert.equal(current?.attempts, 2);
  assert.equal(current?.status, "preparing");
});

test("skipping a job for capacity still allows a smaller queued job to claim", async () => {
  const oversized = await originalJob(1024);
  const smaller = await originalJob();
  const claimed = await jobs.claimNextFilmJob(
    "small-worker",
    Date.now(),
    undefined,
    async (job) => job.id === smaller.id,
  );
  assert.equal(claimed?.id, smaller.id);
  assert.equal(claimed?.attempts, 1);
  assert.equal((await jobs.getFilmJob(oversized.id))?.attempts, 0);
  assert.equal((await jobs.getFilmJob(oversized.id))?.status, "queued");
});

test("an expired lease cannot defer a job or refund its attempt", async () => {
  const queued = await originalJob();
  const claimed = (await jobs.claimNextFilmJob(
    "expired-worker",
    Date.now(),
    queued.id,
  ))!;
  await store.mutateRecord(claimed.id, () => ({
    ...claimed,
    lease: { ...claimed.lease!, expiresAt: 1 },
  }));
  process.env.STORY_FILM_MIN_FREE_BYTES = String(
    Math.floor(Number.MAX_SAFE_INTEGER / 2),
  );
  await worker.processFilmJob(claimed);
  const current = await jobs.getFilmJob(claimed.id);
  assert.equal(current?.attempts, 1);
  assert.equal(current?.status, "preparing");
  assert.equal(current?.lease?.expiresAt, 1);
});

test("a source disappearing during preclaim settles stale and leaves the queue usable", async (t) => {
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  const queued = await originalJob();
  changeSourceAfterInputCheck(
    t,
    queued.originalSources![0].mediaId,
    () => "null",
  );
  const stopped = await worker.runFilmWorkerOnce("missing-source-worker");
  assert.equal(stopped?.id, queued.id);
  assert.equal(stopped?.status, "stale");
  assert.equal(stopped?.lease, undefined);
  assert.equal(stopped?.attempts, 1);
  assert.match(stopped!.error!, /original recording is unavailable/);
  const next = await originalJob(-1);
  const nextResult = await worker.runFilmWorkerOnce("next-source-worker");
  assert.equal(nextResult?.id, next.id);
  assert.equal(nextResult?.status, "failed");
});

test("invalid source size is a failed job, not an indefinite disk pause", async () => {
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  const queued = await originalJob(-1);
  const stopped = await worker.runFilmWorkerOnce("invalid-source-worker");
  assert.equal(stopped?.id, queued.id);
  assert.equal(stopped?.status, "failed");
  assert.equal(stopped?.lease, undefined);
  assert.match(stopped!.error!, /stored size is invalid/);
});

test("a storage read outage during preclaim propagates without claiming the job", async (t) => {
  process.env.STORY_FILM_MIN_FREE_BYTES = "1";
  const queued = await originalJob();
  const outage = Object.assign(new Error("Synthetic storage read failure"), {
    code: "EIO",
  });
  changeSourceAfterInputCheck(t, queued.originalSources![0].mediaId, () => {
    throw outage;
  });
  await assert.rejects(
    worker.runFilmWorkerOnce("storage-outage-worker"),
    outage,
  );
  const current = await jobs.getFilmJob(queued.id);
  assert.equal(current?.status, "queued");
  assert.equal(current?.attempts, 0);
  assert.equal(current?.lease, undefined);
});
