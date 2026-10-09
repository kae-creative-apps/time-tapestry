import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  syntheticFilmCollection,
  syntheticRecordedFilmCollection,
  testVoice,
} from "./film-fixture";
import type { StoryFilmJob } from "../src/lib/collection/films/types";
import { SOURCE_MATCH_REVISION } from "../src/lib/collection/films/word-matching";
import {
  collectionFilmSourceHash,
  filmChapters,
  filmVersionHash,
  FILM_TEMPLATE_VERSION,
} from "../src/lib/collection/films/plan";
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
const original = { processingApproved: true as const };

test("cached deterministic alignment failures cannot be retried or consume another attempt", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
  const claimed = await jobs.claimNextFilmJob(
    "timing-test",
    Date.now(),
    queued.id,
  );
  const message =
    "A selected source word has no verified positive duration. Its original is preserved for review; no automatic cut or caption was made.";
  const failed = await jobs.failFilmJob(
    queued.id,
    claimed!.lease!.token,
    message,
    false,
    true,
  );
  assert.equal(
    failed.status,
    "failed",
    "even an accidental retryable flag cannot repeat deterministic source failure",
  );
  assert.equal(jobs.filmJobView(failed).retryAllowed, false);
  assert.match(jobs.filmJobView(failed).retryBlockedReason!, /editor check/);
  await assert.rejects(
    jobs.retryStoryFilms(c, failed.id, true),
    /editor check/,
  );
  assert.equal((await jobs.getFilmJob(failed.id))!.attempts, 1);
  assert.equal((await jobs.getFilmJob(failed.id))!.status, "failed");
  const confident =
    "The saved answer could not be matched confidently to its original recording. No automatic cut was made.";
  const staleMatcher = await store.mutateRecord<StoryFilmJob>(
    queued.id,
    (job) => {
      const next = { ...job! };
      delete next.sourceMatchRevision;
      return {
        ...next,
        status: "failed",
        attempts: 1,
        error: confident,
        chapters: job!.chapters.map((chapter) => ({
          ...chapter,
          status: "failed",
          error: confident,
        })),
      };
    },
  );
  assert.equal(jobs.filmJobView(staleMatcher).retryAllowed, true);
  assert.equal(
    (await jobs.retryStoryFilms(c, queued.id, true)).status,
    "queued",
  );
  const currentMatcher = await store.mutateRecord<StoryFilmJob>(
    queued.id,
    (job) => ({
      ...job!,
      status: "failed",
      attempts: 2,
      sourceMatchRevision: SOURCE_MATCH_REVISION,
      error: confident,
    }),
  );
  assert.equal(jobs.filmJobView(currentMatcher).retryAllowed, false);
  await assert.rejects(
    jobs.retryStoryFilms(c, queued.id, true),
    /editor check/,
  );
  const olderMatcher = await store.mutateRecord<StoryFilmJob>(
    queued.id,
    (job) => ({
      ...job!,
      status: "failed",
      attempts: 3,
      sourceMatchRevision: SOURCE_MATCH_REVISION - 1,
      error: confident,
    }),
  );
  assert.equal(jobs.filmJobView(olderMatcher).retryAllowed, true);
  assert.equal(
    jobs.filmJobView({
      ...olderMatcher,
      error: `${confident} Match distance 0.42.`,
    }).retryAllowed,
    true,
  );
  for (const error of [
    "The same answer occurs more than once in its recordings. Automatic editing could not choose a unique passage.",
    "The complete answer boundaries could not be verified. No partial-thought cut was made.",
    "A short answer needs a verified neighboring answer before its source can be selected automatically.",
  ])
    assert.equal(jobs.filmJobView({ ...failed, error }).retryAllowed, false);
  const chapterMiss =
    "This chapter's saved answers could not be matched to its original recording. No automatic cut was made.";
  const partial = jobs.filmJobView({
    ...failed,
    attempts: 1,
    sourceMatchRevision: SOURCE_MATCH_REVISION,
    error:
      "Some chapters could not be matched to their original recordings. Completed films are saved.",
    chapters: failed.chapters.map((chapter, index) =>
      index === 3
        ? { ...chapter, status: "failed", error: chapterMiss }
        : { ...chapter, status: "ready", error: undefined },
    ),
  });
  assert.equal(partial.retryAllowed, false);
  assert.equal(
    partial.chapters.filter((chapter) => chapter.error === chapterMiss).length,
    1,
  );
  const olderChapterMiss = {
    ...failed,
    attempts: 1,
    error:
      "Some chapters could not be matched to their original recordings. Completed films are saved.",
    chapters: failed.chapters.map((chapter, index) =>
      index === 3
        ? { ...chapter, status: "failed" as const, error: chapterMiss }
        : { ...chapter, status: "ready" as const, error: undefined },
    ),
  };
  delete olderChapterMiss.sourceMatchRevision;
  assert.equal(jobs.filmJobView(olderChapterMiss).retryAllowed, true);
});

test("finished chapter audio is ready even if rematch left those chapters preparing", () => {
  const playback = {
    schemaVersion: 1 as const,
    jobId: "film_test",
    chapterId: "q2",
    mediaId: "playbackmedia_test",
    sourceTakeIds: ["take"],
    sourceSha256: "a".repeat(64),
    planSha256: "b".repeat(64),
    outputSha256: "c".repeat(64),
    durationMs: 1200,
    words: [{ text: "Hello", startMs: 0, endMs: 400 }],
    createdAt: new Date().toISOString(),
  };
  const restored = jobs.withFinishedChaptersReady({
    outputMode: "interactive",
    chapters: [
      { chapterId: "q1", status: "ready", progress: 1, playback },
      {
        chapterId: "q2",
        status: "preparing",
        progress: 0,
        error: "Chapter playback storage verification failed.",
        playback,
      },
      { chapterId: "q3", status: "queued", progress: 0 },
    ],
  } as StoryFilmJob);
  assert.equal(restored.chapters[0].status, "ready");
  assert.equal(restored.chapters[1].status, "ready");
  assert.equal(restored.chapters[1].error, undefined);
  assert.equal(restored.chapters[2].status, "queued");
});

test("recoverable film failures retain retry while an exhausted job exposes an explicit hold", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
  const failed = await store.mutateRecord<StoryFilmJob>(queued.id, (job) => ({
    ...job!,
    status: "failed",
    attempts: 1,
    error: "Transcription service temporarily unavailable.",
  }));
  assert.equal(jobs.filmJobView(failed).retryAllowed, true);
  assert.equal(
    (await jobs.retryStoryFilms(c, queued.id, true)).status,
    "queued",
  );
  const exhausted = await store.mutateRecord<StoryFilmJob>(
    queued.id,
    (job) => ({ ...job!, status: "failed", attempts: 3 }),
  );
  assert.equal(jobs.filmJobView(exhausted).attempts, 3);
  assert.equal(jobs.filmJobView(exhausted).retryAllowed, false);
  assert.match(
    jobs.filmJobView(exhausted).retryBlockedReason!,
    /three attempts/,
  );
});

async function legacyNarrationFixture(ready = false, attached = false) {
  const c = syntheticFilmCollection();
  const sourceSha256 = collectionFilmSourceHash(c);
  const versionHash = filmVersionHash(sourceSha256, testVoice);
  const job: StoryFilmJob = {
    schemaVersion: 1,
    kind: "story-film-job",
    id: `film_${versionHash}`,
    mode: "ai_narration",
    collectionId: c.id,
    storytellerName: c.storyteller.name,
    versionHash,
    sourceSha256,
    templateVersion: FILM_TEMPLATE_VERSION,
    voice: testVoice,
    status: ready ? "ready" : "queued",
    chapters: filmChapters(c),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    scriptsApprovedAt: c.createdAt,
    attempts: ready ? 1 : 0,
  };
  if (ready) {
    for (const chapter of job.chapters) {
      const mediaId = `legacy_${c.id}_${chapter.chapterId}`;
      await store.putMedia({
        id: mediaId,
        collectionId: c.id,
        role: "owner",
        mimeType: "video/mp4",
        originalName: "historical-film.mp4",
        bytes: 10,
        createdAt: c.createdAt,
        localPath: "/historical-fixture",
      });
      chapter.status = "ready";
      chapter.artifact = {
        jobId: job.id,
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
      if (attached) {
        const target = c.chapters.find(
          (item) => item.id === chapter.chapterId,
        )!;
        target.videoMediaId = mediaId;
        target.videoStatus = "ready";
        target.film = chapter.artifact;
        target.reviewedFilmSha256 = chapter.artifact.outputSha256;
      }
    }
  }
  await store.putCollection(c);
  await store.mutateRecord(job.id, () => job);
  await store.mutateRecord(`film-index-${c.id}`, () => ({ ids: [job.id] }));
  await store.mutateRecord<{ ids: string[] }>(
    "story-film-registry",
    (registry) => ({
      ids: [...(registry?.ids ?? []), job.id],
    }),
  );
  return { c, job };
}

test("AI narration enqueue rejects before resolving a voice or calling a provider", async (t) => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  let resolved = false;
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Retired narration must not call providers.");
  });
  for (const approved of [false, true])
    await assert.rejects(
      jobs.enqueueStoryFilms(c, approved, {
        resolveVoice: async () => {
          resolved = true;
          return testVoice;
        },
      }),
      /own recorded voice/,
    );
  assert.equal(resolved, false);
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(await jobs.latestFilmJob(c.id), null);
});

test("retired film API actions return 410 without queuing or provider work", async (t) => {
  const c = syntheticFilmCollection();
  await store.putCollection(c);
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Retired film actions must not call providers.");
  });
  for (const action of ["generate", "enqueue", "retry"]) {
    const response = await route.POST(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/films?key=${c.ownerKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, scriptsApproved: true }),
        },
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /own recorded voice/);
  }
  assert.equal(provider.mock.callCount(), 0);
  assert.equal(await jobs.latestFilmJob(c.id), null);
});

test("unfinished legacy narration queues become stale without a claim or retry", async () => {
  for (const mode of [undefined, "ai_narration"] as const) {
    const { c, job } = await legacyNarrationFixture();
    job.mode = mode;
    await store.mutateRecord(job.id, () => job);
    let checkedCapacity = false;
    assert.equal(
      await jobs.claimNextFilmJob(
        "legacy-worker",
        Date.now(),
        job.id,
        async () => {
          checkedCapacity = true;
          return true;
        },
      ),
      null,
    );
    assert.equal(checkedCapacity, false);
    const retired = (await jobs.getFilmJob(job.id))!;
    assert.equal(retired.status, "stale");
    assert.equal(retired.attempts, 0);
    assert.equal(retired.lease, undefined);
    assert.match(retired.error!, /own recorded voice/);
    await assert.rejects(
      jobs.retryStoryFilms(c, job.id, true),
      /own recorded voice/,
    );
    await assert.rejects(
      jobs.retryStoryFilms(c, job.id, true, "ai_narration"),
      /own recorded voice/,
    );
    assert.deepEqual(await store.getCollection(c.id), c);
  }
});

test("a previously claimed narration job stops before transcription or provider work", async (t) => {
  const { c, job } = await legacyNarrationFixture();
  job.status = "narrating";
  job.attempts = 1;
  job.lease = { token: "legacy-worker-token", expiresAt: Date.now() + 120000 };
  await store.mutateRecord(job.id, () => job);
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("A retired worker must not call providers.");
  });
  let transcribed = false;
  const { processFilmJob } = await import("../src/lib/collection/films/worker");
  const stopped = await processFilmJob(job, {
    transcribe: async () => {
      transcribed = true;
      throw new Error("A retired worker must not transcribe.");
    },
  });
  assert.equal(stopped?.status, "stale");
  assert.match(stopped!.error!, /own recorded voice/);
  assert.equal(stopped?.lease, undefined);
  assert.equal(transcribed, false);
  assert.equal(provider.mock.callCount(), 0);
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("unpublished legacy narration artifacts cannot be newly attached", async () => {
  const { c, job } = await legacyNarrationFixture(true);
  await assert.rejects(jobs.attachReadyFilms(job), /own recorded voice/);
  assert.deepEqual(await store.getCollection(c.id), c);
  assert.ok(await store.getMedia(job.chapters[0].artifact!.mediaId));
  assert.equal((await jobs.getFilmJob(job.id))?.status, "ready");
});

test("already attached historical films remain readable and retain their review", async () => {
  const { c, job } = await legacyNarrationFixture(true, true);
  const response = await route.GET(
    new NextRequest(
      `http://localhost/api/collection/${c.id}/films?key=${c.ownerKey}`,
    ),
    { params: Promise.resolve({ id: c.id }) },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.job.status, "ready");
  assert.deepEqual(result.job.chapters[0].artifact, job.chapters[0].artifact);
  assert.equal(result.available, false);
  assert.equal(result.recordingOnly, true);
  assert.equal(
    await jobs.claimNextFilmJob("new-worker", Date.now(), job.id),
    null,
  );
  assert.deepEqual(await store.getCollection(c.id), c);
});
test("explicit original processing approval and idempotent concurrent enqueue", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  await assert.rejects(
    jobs.enqueueAutomaticOriginalFilms(c, {
      processingApproved: false as true,
    }),
    /Confirm automatic transcription/,
  );
  const [a, b] = await Promise.all([
    jobs.enqueueAutomaticOriginalFilms(c, original),
    jobs.enqueueAutomaticOriginalFilms(c, original),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await jobs.latestFilmJob(c.id))?.id, a.id);
  assert.equal(a.attempts, 0);
});
test("daily versions are bounded but existing job reads do not consume a version", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  await jobs.enqueueAutomaticOriginalFilms(c, { ...original, dailyLimit: 1 });
  await jobs.enqueueAutomaticOriginalFilms(c, { ...original, dailyLimit: 1 });
  c.chapters[0].content += " A correction.";
  await store.putCollection(c);
  await assert.rejects(
    jobs.enqueueAutomaticOriginalFilms(c, { ...original, dailyLimit: 1 }),
    /film versions per day/,
  );
});
test("failed and stale attempts do not burn the daily film allowance", async () => {
  assert.equal(jobs.storyFilmDailyLimit(undefined, undefined), 10);
  assert.equal(jobs.storyFilmDailyLimit(undefined, ""), 10);
  assert.equal(jobs.storyFilmDailyLimit(undefined, "3"), 3);
  assert.equal(jobs.storyFilmDailyLimit(undefined, "25"), 25);
  assert.equal(jobs.storyFilmDailyLimit(undefined, "40"), 25);
  assert.equal(jobs.storyFilmDailyLimit(undefined, "0"), 1);
  assert.equal(jobs.storyFilmDailyLimit(undefined, "nope"), 10);
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const failed = await jobs.enqueueAutomaticOriginalFilms(c, {
    ...original,
    dailyLimit: 1,
  });
  await store.mutateRecord<StoryFilmJob>(failed.id, (job) => ({
    ...job!,
    status: "failed",
  }));
  c.chapters[0].content += " A correction.";
  await store.putCollection(c);
  const afterFailure = await jobs.enqueueAutomaticOriginalFilms(c, {
    ...original,
    dailyLimit: 1,
  });
  assert.notEqual(afterFailure.id, failed.id);
  await store.mutateRecord<StoryFilmJob>(afterFailure.id, (job) => ({
    ...job!,
    status: "stale",
  }));
  c.chapters[0].content += " Another correction.";
  await store.putCollection(c);
  const afterStale = await jobs.enqueueAutomaticOriginalFilms(c, {
    ...original,
    dailyLimit: 1,
  });
  assert.notEqual(afterStale.id, afterFailure.id);
  c.chapters[0].content += " One more correction.";
  await store.putCollection(c);
  await assert.rejects(
    jobs.enqueueAutomaticOriginalFilms(c, { ...original, dailyLimit: 1 }),
    /film versions per day/,
  );
  const yesterday = new Date(Date.now() - 86400000 - 60000);
  await store.mutateRecord<StoryFilmJob>(afterStale.id, (job) => ({
    ...job!,
    createdAt: yesterday.toISOString(),
  }));
  const afterWindow = await jobs.enqueueAutomaticOriginalFilms(c, {
    ...original,
    dailyLimit: 1,
  });
  assert.notEqual(afterWindow.id, afterStale.id);
});
test("only one worker claims a job, expired original leases resume with bounded retry", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
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
  const resumed = await jobs.getFilmJob(queued.id);
  assert.equal(resumed?.status, "queued");
  assert.equal(resumed?.attempts, 1);
  assert.ok(Date.parse(resumed!.nextAttemptAt!) > Date.now());
  await assert.rejects(
    jobs.updateFilmJob(queued.id, claimed.lease!.token, (job) => job),
    /lease expired/,
  );
  await store.mutateRecord<StoryFilmJob>(queued.id, (job) => ({
    ...job!,
    status: "failed",
  }));
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
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  await jobs.enqueueAutomaticOriginalFilms(c, original);
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
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
  const claimed = (await jobs.claimNextFilmJob(
    "attach-worker",
    Date.now(),
    queued.id,
  ))!;
  await jobs.attachReadyFilms(claimed);
  assert.ok(
    (await store.getCollection(c.id))!.chapters.every(
      (chapter) => !chapter.film,
    ),
  );
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
      narrationKind: "original_recording",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      presentation: "video",
      planSha256: "a".repeat(64),
      sourceRanges: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          inMs: 0,
          outMs: 1000,
        },
      ],
      sourceAssets: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          sha256: "b".repeat(64),
          durationMs: 12000,
        },
      ],
      outputSha256: String(chapter.chapterNumber).repeat(64),
      durationSeconds: 10,
      createdAt: c.createdAt,
    };
    chapter.sourceEdit = {
      chapterId: chapter.chapterId,
      presentation: "video",
      clips: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          inMs: 0,
          outMs: 1000,
        },
      ],
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
  assert.equal(
    attached.notifications.filter((notice) =>
      notice.id.includes(":films-ready:"),
    ).length,
    1,
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

test("a newly approved presentation prevents an older original job from claiming or publishing", async () => {
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const older = await jobs.enqueueAutomaticOriginalFilms(c, original);
  const newer = await jobs.enqueueAutomaticOriginalFilms(c, {
    ...original,
    presentation: "audio",
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
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
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
      narrationKind: "original_recording",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      presentation: "video",
      planSha256: "a".repeat(64),
      sourceRanges: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          inMs: 0,
          outMs: 1000,
        },
      ],
      sourceAssets: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          sha256: "b".repeat(64),
          durationMs: 12000,
        },
      ],
      outputSha256: String(chapter.chapterNumber).repeat(64),
      durationSeconds: 10,
      createdAt: c.createdAt,
    };
    chapter.sourceEdit = {
      chapterId: chapter.chapterId,
      presentation: "video",
      clips: [
        {
          mediaId: c.takes[chapter.chapterNumber - 1].mediaId!,
          inMs: 0,
          outMs: 1000,
        },
      ],
    };
    chapter.status = "ready";
  }
  await jobs.updateFilmJob(claimed.id, claimed.lease!.token, () => claimed);
  return { c, claimed };
}

test("a matcher miss queues one storyteller attention notice and does not duplicate", async () => {
  const { c, claimed } = await completedClaim();
  const missed = claimed.chapters[1];
  missed.artifact = undefined;
  missed.playback = undefined;
  missed.status = "matching";
  missed.sourceEdit = {
    chapterId: missed.chapterId,
    presentation: "video",
    clips: [],
  };
  await jobs.updateFilmJob(claimed.id, claimed.lease!.token, () => claimed);
  const { processFilmJob } = await import("../src/lib/collection/films/worker");
  const result = await processFilmJob(claimed);
  assert.equal(result?.status, "failed");
  const saved = (await store.getCollection(c.id))!;
  assert.equal(
    saved.chapters.filter((chapter) => chapter.film).length,
    3,
  );
  assert.equal(
    saved.chapters.find((chapter) => chapter.id === missed.chapterId)?.film,
    undefined,
  );
  assert.equal(
    saved.notifications.filter((notice) =>
      notice.id.includes(":films-ready:"),
    ).length,
    0,
  );
  const notices = saved.notifications.filter(
    (notice) => notice.kind === "preparation_attention",
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].to, c.storyteller.email);
  assert.notEqual(notices[0].to, c.recipient.email);
  assert.match(notices[0].subject, /needs attention/i);
  assert.match(notices[0].text, /Nothing has been shared/);
  assert.equal(notices[0].status, "pending");
  await jobs.publishFilmAttention(result!);
  assert.equal(
    (await store.getCollection(c.id))!.notifications.filter(
      (notice) => notice.kind === "preparation_attention",
    ).length,
    1,
  );
});

test("finished films attach when one chapter is still missing", async () => {
  const { c, claimed } = await completedClaim();
  const missed = claimed.chapters[2];
  missed.artifact = undefined;
  missed.status = "failed";
  await jobs.updateFilmJob(claimed.id, claimed.lease!.token, () => claimed);
  await jobs.attachReadyFilms(claimed);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.chapters.filter((chapter) => chapter.film).length, 3);
  assert.equal(
    saved.chapters.find((chapter) => chapter.id === missed.chapterId)?.film,
    undefined,
  );
  assert.equal(
    saved.notifications.filter((notice) =>
      notice.id.includes(":films-ready:"),
    ).length,
    0,
  );
  const { approveCollection } = await import("../src/lib/collection/content");
  const reviewedFilmHashes = Object.fromEntries(
    saved.chapters
      .filter((chapter) => chapter.film)
      .map((chapter) => [chapter.id, chapter.film!.outputSha256]),
  );
  assert.throws(
    () =>
      approveCollection(saved, saved.createdAt, {
        recordingsReviewed: true,
        reviewedFilmHashes,
      }),
    /all four/i,
  );
});

test("downloadable exports still wait for all four films", async () => {
  const { claimed } = await completedClaim();
  claimed.sourceJobId = "film_source";
  claimed.chapters[0].artifact = undefined;
  await assert.rejects(jobs.attachReadyFilms(claimed), /All four/);
});

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

test("a crash after atomic attachment settles ready without a source-processing retry", async () => {
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
  const c = await syntheticRecordedFilmCollection();
  await store.putCollection(c);
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, original);
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

async function templateFixture(mode: "manual" | "automatic") {
  const c = await syntheticRecordedFilmCollection();
  if (mode === "automatic") {
    return {
      c,
      queued: await jobs.enqueueAutomaticOriginalFilms(c, {
        processingApproved: true,
      }),
    };
  }
  const plans = await import("../src/lib/collection/films/original-plan");
  const edit = await plans.saveOriginalFilmEdit(
    c,
    c.chapters.map((chapter, index) => ({
      chapterId: chapter.id,
      presentation: "audio",
      clips: [{ mediaId: c.takes[index].mediaId!, inMs: 0, outMs: 1000 }],
    })),
    null,
  );
  return {
    c,
    queued: await jobs.enqueueOriginalFilms(c, edit.revisionHash, true, true),
  };
}

for (const mode of ["manual", "automatic"] as const) {
  test(`${mode} jobs require their current template before claim and retry`, async () => {
    const { c, queued } = await templateFixture(mode);
    assert.equal(await jobs.filmJobInputsCurrent(queued, c), true);
    const old = await store.mutateRecord<StoryFilmJob>(queued.id, (job) => ({
      ...job!,
      templateVersion: "previous-template-version",
    }));
    assert.equal(await jobs.filmJobInputsCurrent(old, c), false);
    assert.equal(
      await jobs.claimNextFilmJob("template-worker", Date.now(), old.id),
      null,
    );
    const stale = (await jobs.getFilmJob(old.id))!;
    assert.equal(stale.status, "stale");
    assert.equal(stale.attempts, 0);
    assert.deepEqual(stale.chapters, old.chapters);
    assert.match(stale.error!, /template changed/);

    await store.mutateRecord<StoryFilmJob>(old.id, (job) => ({
      ...job!,
      status: "failed",
    }));
    await assert.rejects(
      jobs.retryStoryFilms(c, old.id, true, "original"),
      /template changed/,
    );
    assert.equal((await jobs.getFilmJob(old.id))?.status, "stale");
    assert.deepEqual(await store.getCollection(c.id), c);
  });

  test(`${mode} current jobs claim normally but an expired old-template lease becomes stale`, async () => {
    const { c, queued } = await templateFixture(mode);
    const claimed = (await jobs.claimNextFilmJob(
      "template-worker",
      Date.now(),
      queued.id,
    ))!;
    assert.equal(claimed.id, queued.id);
    assert.equal(await jobs.filmJobInputsCurrent(claimed, c), true);
    await store.mutateRecord<StoryFilmJob>(claimed.id, (job) => ({
      ...job!,
      templateVersion: "previous-template-version",
      lease: { ...job!.lease!, expiresAt: 1 },
    }));
    assert.equal(
      await jobs.claimNextFilmJob("replacement-worker", Date.now(), claimed.id),
      null,
    );
    const stale = (await jobs.getFilmJob(claimed.id))!;
    assert.equal(stale.status, "stale");
    assert.equal(stale.lease, undefined);
    assert.equal(stale.nextAttemptAt, undefined);
    assert.equal(stale.attempts, 1);
  });
}

test("a partial old-template job keeps completed artifacts while preventing mixed-template output", async () => {
  const { c, claimed } = await completedClaim();
  const old = await store.mutateRecord<StoryFilmJob>(claimed.id, (job) => ({
    ...job!,
    templateVersion: "previous-template-version",
    lease: { ...job!.lease!, expiresAt: 1 },
    chapters: job!.chapters.map((chapter, index) =>
      index === 0
        ? chapter
        : {
            ...chapter,
            status: "queued",
            artifact: undefined,
          },
    ),
  }));
  const preservedChapters = (await jobs.getFilmJob(claimed.id))!.chapters;
  assert.equal(
    await jobs.claimNextFilmJob("new-template-worker", Date.now(), claimed.id),
    null,
  );
  const stale = (await jobs.getFilmJob(claimed.id))!;
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.chapters, preservedChapters);
  assert.ok(await store.getMedia(old.chapters[0].artifact!.mediaId));
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("completed approved films retain their exact outputs and review after a template update", async () => {
  const { c, claimed } = await completedClaim();
  await jobs.attachReadyFilms(claimed);
  const old = await store.mutateRecord<StoryFilmJob>(claimed.id, (job) => ({
    ...job!,
    status: "ready",
    lease: undefined,
    templateVersion: "previous-template-version",
  }));
  const approved = (await store.getCollection(c.id))!;
  approved.status = "approved";
  for (const chapter of approved.chapters) {
    chapter.editorialReviewed = true;
    chapter.reviewedFilmSha256 = chapter.film!.outputSha256;
  }
  await store.putCollection(approved);
  assert.equal(await jobs.filmJobInputsCurrent(old, approved), true);
  assert.equal(
    await jobs.claimNextFilmJob("new-template-worker", Date.now(), old.id),
    null,
  );
  await jobs.attachReadyFilms(old);
  const after = (await store.getCollection(c.id))!;
  assert.deepEqual({ ...after, updatedAt: approved.updatedAt }, approved);
  assert.equal((await jobs.getFilmJob(old.id))?.status, "ready");
});

test("a template change still recovers a crash after all four outputs were already attached", async () => {
  const { c, claimed } = await completedClaim();
  await jobs.attachReadyFilms(claimed);
  const attached = (await store.getCollection(c.id))!;
  await store.mutateRecord<StoryFilmJob>(claimed.id, (job) => ({
    ...job!,
    templateVersion: "previous-template-version",
    lease: { ...job!.lease!, expiresAt: 1 },
  }));
  assert.equal(
    await jobs.claimNextFilmJob("recovery-worker", Date.now(), claimed.id),
    null,
  );
  assert.equal((await jobs.getFilmJob(claimed.id))?.status, "ready");
  assert.deepEqual(await store.getCollection(c.id), attached);
});
