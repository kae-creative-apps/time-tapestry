import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { syntheticFilmCollection, testVoice } from "./film-fixture";
let store: typeof import("../src/lib/collection/store");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let route: typeof import("../src/app/api/collection/[id]/films/route");
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "ELEVENLABS_API_KEY",
  ])
    delete process.env[key];
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "film-jobs-tests-"),
  );
  store = await import("../src/lib/collection/store");
  jobs = await import("../src/lib/collection/films/jobstore");
  route = await import("../src/app/api/collection/[id]/films/route");
});
const voice = { resolveVoice: async () => testVoice };
test("explicit script approval and idempotent concurrent enqueue", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  await assert.rejects(jobs.enqueueStoryFilms(c, false, voice), /Approve/);
  const [a, b] = await Promise.all([
    jobs.enqueueStoryFilms(c, true, voice),
    jobs.enqueueStoryFilms(c, true, voice),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await jobs.latestFilmJob(c.id))?.id, a.id);
  assert.equal(a.attempts, 0);
});
test("daily versions are bounded but existing job reads do not consume a version", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  await jobs.enqueueStoryFilms(c, true, { ...voice, dailyLimit: 1 });
  await jobs.enqueueStoryFilms(c, true, { ...voice, dailyLimit: 1 });
  c.chapters[0].content += " A correction.";
  await store.putCollection(c);
  await assert.rejects(
    jobs.enqueueStoryFilms(c, true, { ...voice, dailyLimit: 1 }),
    /film versions per day/,
  );
});
test("only one worker claims a job, expired leases fail for explicit bounded retry", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueStoryFilms(c, true, voice);
  const attempts = await Promise.all([
    jobs.claimNextFilmJob("worker-a", Date.now(), queued.id),
    jobs.claimNextFilmJob("worker-b", Date.now(), queued.id),
  ]);
  assert.equal(attempts.filter(Boolean).length, 1);
  const claimed = attempts.find(Boolean)!;
  await store.mutateRecord(claimed.id, (job: any) => ({
    ...job,
    lease: { ...job.lease, expiresAt: 1 },
  }));
  assert.equal(
    await jobs.claimNextFilmJob("worker-c", Date.now(), queued.id),
    null,
  );
  assert.equal((await jobs.getFilmJob(queued.id))?.status, "failed");
  await assert.rejects(
    jobs.updateFilmJob(queued.id, claimed.lease!.token, (job) => job),
    /lease expired/,
  );
  assert.equal(
    (await jobs.retryStoryFilms(c, queued.id, true)).status,
    "queued",
  );
  await store.mutateRecord(queued.id, (job: any) => ({
    ...job,
    status: "failed",
    attempts: 3,
  }));
  await assert.rejects(
    jobs.retryStoryFilms(c, queued.id, true),
    /three attempts/,
  );
});
test("edited scripts are stale and private job endpoint never exposes scripts to recipient", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  await jobs.enqueueStoryFilms(c, true, voice);
  c.chapters[0].content += " Changed after enqueue.";
  await store.putCollection(c);
  const context = { params: Promise.resolve({ id: c.id }) };
  const forbidden = await route.GET(
    new NextRequest(
      `http://localhost/api/collection/${c.id}/films?key=${c.recipientKey}`,
    ),
    context,
  );
  assert.equal(forbidden.status, 403);
  const response = await route.GET(
    new NextRequest(
      `http://localhost/api/collection/${c.id}/films?key=${c.ownerKey}`,
    ),
    context,
  );
  const result = await response.json();
  assert.equal(result.job.status, "stale");
  assert.equal(result.job.chapters[0].script, undefined);
  assert.equal(result.workerAvailable, false);
  await jobs.writeWorkerHeartbeat("test-worker");
  assert.equal(await jobs.filmWorkerHealthy(), true);
});
test("all four outputs attach atomically and repeated attachment preserves review", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueStoryFilms(c, true, voice);
  const claimed = (await jobs.claimNextFilmJob(
    "attach-worker",
    Date.now(),
    queued.id,
  ))!;
  await assert.rejects(jobs.attachReadyFilms(claimed), /All four/);
  for (const chapter of claimed.chapters) {
    const mediaId = `synthetic_media_${c.id}_${chapter.chapterId}`;
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "synthetic.mp4",
      bytes: 10,
      createdAt: c.createdAt,
      localPath: "/synthetic-fixture",
    });
    chapter.artifact = {
      jobId: claimed.id,
      chapterId: chapter.chapterId,
      mediaId,
      narrationKind: "ai_interviewer",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      scriptSha256: chapter.scriptSha256,
      audioSha256: "a".repeat(64),
      outputSha256: String(chapter.chapterNumber).repeat(64),
      voiceId: testVoice.voiceId,
      modelId: testVoice.modelId,
      durationSeconds: 10,
      createdAt: c.createdAt,
    };
    chapter.status = "ready";
  }
  await jobs.updateFilmJob(claimed.id, claimed.lease!.token, () => claimed);
  await jobs.attachReadyFilms(claimed);
  const attached = (await store.getCollection(c.id))!;
  assert.ok(
    attached.chapters.every(
      (chapter) => chapter.film && !chapter.editorialReviewed,
    ),
  );
  attached.chapters[0].editorialReviewed = true;
  await store.putCollection(attached);
  await jobs.attachReadyFilms(claimed);
  assert.equal(
    (await store.getCollection(c.id))!.chapters[0].editorialReviewed,
    true,
  );
  c.chapters[0].content += " Changed.";
  await store.putCollection(c);
  await assert.rejects(jobs.attachReadyFilms(claimed), /stories changed/);
});

test("a newly approved voice version prevents an older job from claiming or publishing", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const older = await jobs.enqueueStoryFilms(c, true, voice);
  const newer = await jobs.enqueueStoryFilms(c, true, {
    resolveVoice: async () => ({
      ...testVoice,
      voiceId: "newly-approved-interviewer",
    }),
  });
  assert.notEqual(older.id, newer.id);
  assert.equal(
    await jobs.claimNextFilmJob("old-worker", Date.now(), older.id),
    null,
  );
  assert.equal((await jobs.getFilmJob(older.id))?.status, "stale");
  assert.equal(
    (await jobs.claimNextFilmJob("new-worker", Date.now(), newer.id))?.id,
    newer.id,
  );
});

async function completedClaim() {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueStoryFilms(c, true, voice);
  const claimed = (await jobs.claimNextFilmJob(
    "completion-worker",
    Date.now(),
    queued.id,
  ))!;
  for (const chapter of claimed.chapters) {
    const mediaId = `synthetic_media_${c.id}_${chapter.chapterId}`;
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "synthetic.mp4",
      bytes: 10,
      createdAt: c.createdAt,
      localPath: "/synthetic-fixture",
    });
    chapter.artifact = {
      jobId: claimed.id,
      chapterId: chapter.chapterId,
      mediaId,
      narrationKind: "ai_interviewer",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      scriptSha256: chapter.scriptSha256,
      audioSha256: "a".repeat(64),
      outputSha256: String(chapter.chapterNumber).repeat(64),
      voiceId: testVoice.voiceId,
      modelId: testVoice.modelId,
      durationSeconds: 10,
      createdAt: c.createdAt,
    };
    chapter.status = "ready";
  }
  await jobs.updateFilmJob(claimed.id, claimed.lease!.token, () => claimed);
  return { c, claimed };
}

test("worker completion reuses four preserved artifacts and settles ready without provider calls", async () => {
  const { c, claimed } = await completedClaim();
  process.env.ELEVENLABS_API_KEY = "synthetic-unused-no-provider-request";
  try {
    const { processFilmJob } =
      await import("../src/lib/collection/films/worker");
    const result = await processFilmJob(claimed);
    assert.equal(result?.status, "ready");
    assert.equal(result?.lease, undefined);
    assert.ok(
      (await store.getCollection(c.id))!.chapters.every(
        (chapter) => chapter.film && !chapter.editorialReviewed,
      ),
    );
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
  }
});

test("a crash after atomic attachment settles ready without a narration retry", async () => {
  const { claimed } = await completedClaim();
  await jobs.attachReadyFilms(claimed);
  await store.mutateRecord(claimed.id, (job: any) => ({
    ...job,
    lease: { ...job.lease, expiresAt: 1 },
  }));
  assert.equal(
    await jobs.claimNextFilmJob("recovery-worker", Date.now(), claimed.id),
    null,
  );
  const recovered = await jobs.getFilmJob(claimed.id);
  assert.equal(recovered?.status, "ready");
  assert.equal(recovered?.attempts, 1);
});

test("expired owner can record failure but cannot overwrite a replacement owner", async () => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueStoryFilms(c, true, voice);
  const claimed = (await jobs.claimNextFilmJob(
    "failed-worker",
    Date.now(),
    queued.id,
  ))!;
  await store.mutateRecord(claimed.id, (job: any) => ({
    ...job,
    lease: { ...job.lease, expiresAt: 1 },
  }));
  assert.equal(
    (
      await jobs.failFilmJob(
        claimed.id,
        claimed.lease!.token,
        "The worker stopped.",
        false,
      )
    ).status,
    "failed",
  );
  await jobs.retryStoryFilms(c, claimed.id, true);
  await jobs.claimNextFilmJob("replacement-worker", Date.now(), claimed.id);
  await assert.rejects(
    jobs.failFilmJob(claimed.id, claimed.lease!.token, "Old failure", false),
    /Another worker/,
  );
});
