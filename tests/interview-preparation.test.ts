import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { CHAPTERS } from "../src/lib/interview-state";
import {
  syntheticFilmCollection,
  syntheticRecordedFilmCollection,
} from "./film-fixture";
import type {
  Collection,
  ChapterPackage,
  InterviewChapterId,
} from "../src/lib/collection/types";
import type { InterviewPreparationJob } from "../src/lib/collection/interview-preparation-types";

let directory: string;
let store: typeof import("../src/lib/collection/store");
let preparation: typeof import("../src/lib/collection/interview-preparation");
let content: typeof import("../src/lib/collection/content");
let films: typeof import("../src/lib/collection/films/jobstore");
let route: typeof import("../src/app/api/collection/[id]/route");
let statusRoute: typeof import("../src/app/api/collection/[id]/preparation/route");
let access: typeof import("../src/lib/collection/access");
const consent = { processingApproved: true as const };

before(async () => {
  directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-preparation-tests-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    COLLECTION_EMAIL_ENABLED: "false",
    COLLECTION_DELIVERY_ENABLED: "false",
  });
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "GLOO_API_KEY",
    "ELEVENLABS_API_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
  ])
    delete process.env[key];
  store = await import("../src/lib/collection/store");
  preparation = await import("../src/lib/collection/interview-preparation");
  content = await import("../src/lib/collection/content");
  films = await import("../src/lib/collection/films/jobstore");
  route = await import("../src/app/api/collection/[id]/route");
  statusRoute =
    await import("../src/app/api/collection/[id]/preparation/route");
  access = await import("../src/lib/collection/access");
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function liveFixture() {
  const c = syntheticFilmCollection();
  c.status = "recording";
  c.takes = [];
  c.selectedTakeIds = {};
  c.chapters = [];
  const mediaId = `original_${randomUUID()}`;
  await store.putMedia({
    id: mediaId,
    collectionId: c.id,
    role: "owner",
    mimeType: "audio/webm",
    originalName: "fictional-interview.webm",
    bytes: 1024,
    createdAt: c.createdAt,
    provenance: "uploaded_recording",
    url: "https://recording.example.test/fictional-interview.webm",
  });
  c.interviews = [
    {
      id: `session_${randomUUID()}`,
      provider: "elevenlabs",
      providerConversationId: `conversation_${randomUUID()}`,
      status: "completed",
      startedAt: c.createdAt,
      endedAt: c.createdAt,
      turns: [],
      excludedTurnIds: [],
      segments: [
        {
          id: `segment_${randomUUID()}`,
          mediaId,
          kind: "voice",
          startMs: 0,
          durationMs: 40_000,
          createdAt: c.createdAt,
        },
      ],
    },
  ];
  await store.putCollection(c);
  return c;
}
function recovered(
  c: Collection,
  chapters: InterviewChapterId[] = ["q1", "q2", "q3", "q4"],
) {
  const next = structuredClone(c);
  next.interviews![0].turns = chapters.map((chapterId, index) => ({
    id: `fictional-turn-${chapterId}`,
    sequence: index,
    role: "user" as const,
    text: `A fictional saved memory for ${chapterId}. We made time to listen and help each other.`,
    capturedAt: c.createdAt,
    chapterId,
    timing: "unaligned" as const,
  }));
  return next;
}
async function draft(c: Collection): Promise<ChapterPackage[]> {
  return CHAPTERS.map(({ id, title }) => ({
    id,
    title,
    content: content
      .selectedAnswers(c, id)
      .map((answer) => answer.text)
      .join("\n"),
    postcardNote: "A fictional public note to review.",
    sourceTakeIds: content.selectedAnswers(c, id).map((answer) => answer.id),
    videoStatus: "awaiting_edit",
    editorialReviewed: false,
    generatedWith: "source_text",
  }));
}
const fakeFilms = async () => ({ id: `film_${"f".repeat(64)}` });
function request(
  c: Collection,
  action = "submit_interview",
  key = c.ownerKey,
  body: Record<string, unknown> = consent,
) {
  return new NextRequest(`http://localhost/api/collection/${c.id}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
}

test("durable acceptance needs a saved original and explicit consent, but not four browser transcripts", async (t) => {
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Acceptance must not contact providers");
  });
  const c = await liveFixture();
  const response = await route.POST(request(c), {
    params: Promise.resolve({ id: c.id }),
  });
  assert.equal(response.status, 202);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const body = await response.json();
  const job = await preparation.getInterviewPreparationJob(body.preparation.id);
  assert.equal(job?.status, "queued");
  assert.equal(job?.attempts, 0);
  assert.equal(job?.originalMedia.length, 1);
  assert.ok(job?.processingApprovedAt);
  const registry = await store.readRecord<{ ids: string[] }>(
    "interview-preparation-registry",
  );
  assert.ok(registry?.ids.includes(job!.id));
  assert.equal(
    (await store.getCollection(c.id))?.interviews?.[0].turns.length,
    0,
  );
  assert.equal(provider.mock.callCount(), 0);
  assert.equal("sourceSha256" in body.preparation, false);
  assert.equal("originalInputs" in body.preparation, false);
  assert.equal("lease" in body.preparation, false);

  const denied = await route.POST(
    request(c, "submit_interview", c.ownerKey, { processingApproved: false }),
    { params: Promise.resolve({ id: c.id }) },
  );
  assert.equal(denied.status, 400);
  const requester = await route.POST(
    request(c, "submit_interview", c.requesterKey),
    { params: Promise.resolve({ id: c.id }) },
  );
  assert.notEqual(requester.status, 202);
  const noRecording = syntheticFilmCollection();
  await store.putCollection(noRecording);
  const missing = await route.POST(request(noRecording), {
    params: Promise.resolve({ id: noRecording.id }),
  });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /original.*recording/i);
  assert.equal(provider.mock.callCount(), 0);
});

test("generated films and another person's media cannot be used as original source", async () => {
  for (const invalid of ["generated", "wrong_owner"] as const) {
    const c = await liveFixture();
    const mediaId = c.interviews![0].segments[0].mediaId;
    const media = (await store.getMedia(mediaId))!;
    await store.putMedia({
      ...media,
      ...(invalid === "generated"
        ? { provenance: "generated_film" as const }
        : { collectionId: "another_collection" }),
    });
    await assert.rejects(
      preparation.enqueueInterviewPreparation(c.id, consent),
      /original recording/,
    );
    assert.equal(
      (await store.getCollection(c.id))?.interviewPreparation,
      undefined,
    );
  }
});

test("identical resubmission deduplicates and repairs registry membership without restarting a lease", async () => {
  const c = await liveFixture();
  const first = await preparation.enqueueInterviewPreparation(c.id, consent);
  const claimed = await preparation.claimInterviewPreparation(
    "first-worker",
    Date.now(),
    first.preparation.id,
  );
  await store.mutateRecord<{ ids: string[] }>(
    "interview-preparation-registry",
    (registry) => ({ ids: registry!.ids.filter((id) => id !== claimed!.id) }),
  );
  const again = await preparation.enqueueInterviewPreparation(c.id, consent);
  assert.equal(again.preparation.id, first.preparation.id);
  const job = (await preparation.getInterviewPreparationJob(claimed!.id))!;
  assert.equal(job.status, "preparing");
  assert.equal(job.lease?.token, claimed!.lease?.token);
  assert.equal(job.attempts, 1);
  const registry = await store.readRecord<{ ids: string[] }>(
    "interview-preparation-registry",
  );
  assert.equal(registry?.ids.filter((id) => id === job.id).length, 1);
});

test("recovery precedes four stories and original films, with no ready notice or dispatch", async () => {
  const c = await liveFixture();
  c.notifications.push({
    id: randomUUID(),
    kind: "review_ready",
    to: c.storyteller.email,
    subject: "Older draft",
    text: "Fictional",
    url: "https://example.test",
    dueAt: c.createdAt,
    status: "pending",
  });
  await store.putCollection(c);
  const originals = structuredClone(c.interviews![0].segments);
  const events: string[] = [];
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const result = await preparation.runInterviewPreparationOnce("test-worker", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => {
      events.push("recover");
      return recovered(current);
    },
    draft: async (current) => {
      events.push("draft");
      assert.equal(current.interviews![0].turns.length, 4);
      return draft(current);
    },
    reserveDraftBudget: async () => {
      throw new Error("Unconfigured Gloo must not spend budget");
    },
    enqueueFilms: async (current, options) => {
      events.push("films");
      assert.deepEqual(options, consent);
      assert.equal(current.chapters.length, 4);
      assert.equal(
        current.chapters.every(
          (chapter) => chapter.postcardNote && !chapter.editorialReviewed,
        ),
        true,
      );
      return fakeFilms();
    },
  });
  assert.deepEqual(events, ["recover", "draft", "films"]);
  assert.equal(result?.status, "films_queued");
  assert.equal(result?.lease, undefined);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.status, "draft");
  assert.equal(saved.chapters.length, 4);
  assert.equal(
    saved.chapters.every((chapter) => chapter.generatedWith === "source_text"),
    true,
  );
  assert.deepEqual(saved.interviews![0].segments, originals);
  assert.equal(saved.notifications.length, 0);
  assert.equal(saved.deliveries.length, 0);
  assert.equal(saved.interviewPreparation?.ready, false);
});

test("actual missing areas stop preparation without creating text or queuing films", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let drafts = 0,
    queuedFilms = 0;
  const result = await preparation.runInterviewPreparationOnce("test-worker", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => recovered(current, ["q1"]),
    draft: async (current) => {
      drafts++;
      return draft(current);
    },
    enqueueFilms: async () => {
      queuedFilms++;
      return fakeFilms();
    },
  });
  assert.equal(result?.status, "needs_attention");
  assert.deepEqual(
    result?.missingAreas,
    CHAPTERS.slice(1).map(({ id, title }) => ({ id, title })),
  );
  assert.equal(drafts, 0);
  assert.equal(queuedFilms, 0);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.chapters.length, 0);
  assert.equal(saved.interviews![0].turns.length, 1);
  assert.equal(
    saved.notifications.filter((notice) => notice.kind === "review_ready")
      .length,
    0,
  );
  assert.equal(
    saved.notifications.filter(
      (notice) => notice.kind === "preparation_attention",
    ).length,
    1,
  );
});

test("source changes during recovery discard recovered output and preserve the new source", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let drafts = 0;
  const result = await preparation.runInterviewPreparationOnce("test-worker", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => {
      await store.mutateCollection(c.id, (latest) => {
        latest.interviews![0].turns = recovered(latest, [
          "q4",
        ]).interviews![0].turns;
        return latest;
      });
      return recovered(current);
    },
    draft: async (current) => {
      drafts++;
      return draft(current);
    },
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.status, "needs_attention");
  assert.match(result?.error ?? "", /answers changed/);
  assert.equal(drafts, 0);
  assert.equal(
    (await store.getCollection(c.id))?.interviews?.[0].turns[0].chapterId,
    "q4",
  );
});

test("approved collections abort before recovery and are unchanged", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  await store.mutateCollection(c.id, (latest) => {
    latest.status = "approved";
    return latest;
  });
  const approved = (await store.getCollection(c.id))!;
  let recoveries = 0;
  const result = await preparation.runInterviewPreparationOnce("test-worker", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => {
      recoveries++;
      return recovered(current);
    },
    draft,
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.status, "needs_attention");
  assert.equal(recoveries, 0);
  assert.deepEqual(await store.getCollection(c.id), approved);
});

test("only one lease claims a job; an expired lease resumes and rejects the old writer", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const claims = await Promise.all([
    preparation.claimInterviewPreparation(
      "worker-a",
      Date.now(),
      queued.preparation.id,
    ),
    preparation.claimInterviewPreparation(
      "worker-b",
      Date.now(),
      queued.preparation.id,
    ),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const old = claims.find(Boolean)!;
  await store.mutateRecord<InterviewPreparationJob>(old.id, (saved) => ({
    ...saved!,
    lease: { ...saved!.lease!, expiresAt: Date.now() - 1 },
  }));
  const next = await preparation.claimInterviewPreparation(
    "worker-c",
    Date.now(),
    old.id,
  );
  assert.equal(next?.attempts, 2);
  assert.notEqual(next?.lease?.token, old.lease?.token);
  await assert.rejects(
    preparation.updateInterviewPreparationJob(
      old.id,
      old.lease!.token,
      (saved) => ({ ...saved, status: "films_queued" }),
    ),
    /lease expired/,
  );
  assert.equal(
    (await preparation.getInterviewPreparationJob(old.id))?.lease?.token,
    next?.lease?.token,
  );
});

test("interruption after drafting resumes cached work and does not redraft or refetch the transcript", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let recoveries = 0,
    drafts = 0,
    queues = 0;
  const options = {
    onlyId: queued.preparation.id,
    reconcile: async (current: Collection) => {
      recoveries++;
      return recovered(current);
    },
    draft: async (current: Collection) => {
      drafts++;
      return draft(current);
    },
    enqueueFilms: async () => {
      if (++queues === 1) throw new Error("Synthetic queue interruption");
      return fakeFilms();
    },
  };
  const interrupted = await preparation.runInterviewPreparationOnce(
    "worker-a",
    options,
  );
  assert.equal(interrupted?.status, "queued");
  assert.ok(interrupted?.drafts?.length === 4);
  await store.mutateRecord<InterviewPreparationJob>(
    queued.preparation.id,
    (saved) => ({
      ...saved!,
      nextAttemptAt: new Date(Date.now() - 1).toISOString(),
    }),
  );
  const resumed = await preparation.runInterviewPreparationOnce(
    "worker-b",
    options,
  );
  assert.equal(resumed?.status, "films_queued");
  assert.deepEqual([recoveries, drafts, queues], [1, 1, 2]);
  assert.equal((await store.getCollection(c.id))?.draftHistory?.length ?? 0, 0);
});

test("owner-only status is private and readiness requires all four matching original attachments", async () => {
  const c = await syntheticRecordedFilmCollection();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const completed = await preparation.runInterviewPreparationOnce(
    "test-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => current,
      draft,
      enqueueFilms: (current, options) =>
        films.enqueueAutomaticOriginalFilms(current, options),
    },
  );
  assert.equal(completed?.status, "films_queued");
  let saved = (await store.getCollection(c.id))!;
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.ready,
    false,
  );
  const job = (await films.getFilmJob(completed!.filmJobId!))!;
  for (const chapter of job.chapters) {
    const mediaId = `output_${randomUUID()}`;
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "fictional-render.mp4",
      bytes: 100,
      url: "https://output.example.test/fictional.mp4",
      createdAt: c.createdAt,
      provenance: "generated_film",
    });
    chapter.status = "ready";
    chapter.artifact = {
      jobId: job.id,
      chapterId: chapter.chapterId,
      mediaId,
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      outputSha256: String(chapter.chapterNumber).repeat(64),
      durationSeconds: 10,
      createdAt: c.createdAt,
      narrationKind: "original_recording",
      presentation: "video",
      planSha256: "a".repeat(64),
      sourceRanges: [],
      sourceAssets: [],
    };
    const target = saved.chapters.find(
      (item) => item.id === chapter.chapterId,
    )!;
    target.videoStatus = "ready";
    target.videoMediaId = mediaId;
    target.film = chapter.artifact;
  }
  job.status = "ready";
  await store.mutateRecord(job.id, () => job);
  await store.putCollection(saved);
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.ready,
    true,
  );
  const owner = await statusRoute.GET(
    new NextRequest(
      `http://localhost/api/collection/${c.id}/preparation?key=${c.ownerKey}`,
    ),
    { params: Promise.resolve({ id: c.id }) },
  );
  assert.equal(owner.status, 200);
  assert.match(owner.headers.get("cache-control")!, /private.*no-store/);
  const ownerBody = await owner.json();
  assert.equal(ownerBody.preparation.ready, true);
  assert.equal("sourceSha256" in ownerBody.preparation, false);
  for (const key of [c.requesterKey, c.recipientKey, "unknown-key"]) {
    const response = await statusRoute.GET(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/preparation?key=${key}`,
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
    assert.equal(response.status, 404);
  }
  assert.equal(
    access.publicView(saved, "requester").interviewPreparation,
    undefined,
  );
  assert.equal(
    access.publicView(saved, "recipient").interviewPreparation,
    undefined,
  );
  saved.chapters[3].videoStatus = "awaiting_edit";
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.ready,
    false,
  );
  saved.chapters[3].videoStatus = "ready";
  saved.chapters[3].film!.outputSha256 = "f".repeat(64);
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.ready,
    false,
  );
});

test("a later provider transcript can fill missing areas on an explicit retry", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  await preparation.runInterviewPreparationOnce("worker-a", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => recovered(current, ["q1"]),
    draft,
    enqueueFilms: fakeFilms,
  });
  const retry = await preparation.enqueueInterviewPreparation(c.id, {
    ...consent,
    retry: true,
  });
  assert.equal(retry.preparation.id, queued.preparation.id);
  const result = await preparation.runInterviewPreparationOnce("worker-b", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => recovered(current),
    draft,
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.status, "films_queued");
  assert.equal(
    (await store.getCollection(c.id))?.interviews?.[0].turns.length,
    4,
  );
});

test("recovery may correct topic attribution but cannot remove or rewrite existing raw words", async () => {
  for (const alteration of ["text", "remove"] as const) {
    let c = await liveFixture();
    c = recovered(c, ["q1"]);
    await store.putCollection(c);
    const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
    const result = await preparation.runInterviewPreparationOnce("worker-a", {
      onlyId: queued.preparation.id,
      reconcile: async (current) => {
        const copy = recovered(current);
        if (alteration === "text")
          copy.interviews![0].turns[0].text =
            "Invented replacement must not publish.";
        else copy.interviews![0].turns.shift();
        return copy;
      },
      draft,
      enqueueFilms: fakeFilms,
    });
    assert.equal(result?.status, "needs_attention");
    assert.match(result?.error ?? "", /preserve the saved words/);
    assert.deepEqual(
      (await store.getCollection(c.id))?.interviews?.[0].turns,
      c.interviews![0].turns,
    );
  }
  let c = await liveFixture();
  c = recovered(c);
  c.interviews![0].turns[1].chapterId = "q1";
  await store.putCollection(c);
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const result = await preparation.runInterviewPreparationOnce("worker-b", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => recovered(current),
    draft,
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.status, "films_queued");
  const saved = (await store.getCollection(c.id))!;
  assert.equal(
    saved.interviews![0].turns[1].text,
    c.interviews![0].turns[1].text,
  );
  assert.equal(saved.interviews![0].turns[1].chapterId, "q2");
});

test("duplicate submission preserves the matching films-ready email; a failed film retry requeues original work", async () => {
  const c = await syntheticRecordedFilmCollection();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const result = await preparation.runInterviewPreparationOnce("worker-a", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => current,
    draft,
    enqueueFilms: (current, options) =>
      films.enqueueAutomaticOriginalFilms(current, options),
  });
  const filmId = result!.filmJobId!;
  await store.mutateCollection(c.id, (current) => {
    current.notifications.push({
      id: `${c.id}:films-ready:${filmId}`,
      kind: "review_ready",
      to: c.storyteller.email,
      subject: "Ready",
      text: "Fictional ready notification",
      url: "https://example.test/review",
      dueAt: c.createdAt,
      status: "pending",
    });
    return current;
  });
  await preparation.enqueueInterviewPreparation(c.id, consent);
  assert.equal((await store.getCollection(c.id))?.notifications.length, 1);
  await store.mutateRecord<
    import("../src/lib/collection/films/types").StoryFilmJob
  >(filmId, (job) => ({ ...job!, status: "failed", attempts: 1 }));
  const retry = await preparation.enqueueInterviewPreparation(c.id, {
    ...consent,
    retry: true,
  });
  assert.equal(retry.preparation.status, "queued");
  const retried = await preparation.runInterviewPreparationOnce("worker-b", {
    onlyId: queued.preparation.id,
    reconcile: async () => {
      throw new Error("Cached recovery must not refetch");
    },
    draft: async () => {
      throw new Error("Cached drafts must not regenerate");
    },
    enqueueFilms: (current, options) =>
      films.enqueueAutomaticOriginalFilms(current, options),
  });
  assert.equal(retried?.status, "films_queued");
  assert.equal((await films.getFilmJob(filmId))?.status, "queued");
  assert.equal((await store.getCollection(c.id))?.notifications.length, 1);
});

test("source mutation during drafting prevents draft attachment and film queueing", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let filmQueues = 0;
  const result = await preparation.runInterviewPreparationOnce("worker-a", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => recovered(current),
    draft: async (current) => {
      const chapters = await draft(current);
      await store.mutateCollection(c.id, (latest) => {
        latest.interviews![0].excludedTurnIds.push("fictional-turn-q2");
        return latest;
      });
      return chapters;
    },
    enqueueFilms: async () => {
      filmQueues++;
      return fakeFilms();
    },
  });
  assert.equal(result?.status, "needs_attention");
  assert.equal(filmQueues, 0);
  assert.equal((await store.getCollection(c.id))?.chapters.length, 0);
});

test("exhausted original film work queues owner attention and rejects another preparation retry", async () => {
  const c = await syntheticRecordedFilmCollection();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const result = await preparation.runInterviewPreparationOnce(
    "preparation-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => current,
      draft,
      enqueueFilms: (current, options) =>
        films.enqueueAutomaticOriginalFilms(current, options),
    },
  );
  const id = result!.filmJobId!;
  await store.mutateRecord<
    import("../src/lib/collection/films/types").StoryFilmJob
  >(id, (job) => ({ ...job!, attempts: 2 }));
  const claimed = await films.claimNextFilmJob(
    "last-film-worker",
    Date.now(),
    id,
  );
  assert.equal(claimed?.attempts, 3);
  await films.failFilmJob(
    id,
    claimed!.lease!.token,
    "Synthetic render failure",
    false,
    true,
  );
  const saved = (await store.getCollection(c.id))!;
  assert.equal(
    saved.notifications.filter(
      (notice) => notice.kind === "preparation_attention",
    ).length,
    1,
  );
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.canRetry,
    false,
  );
  await assert.rejects(
    preparation.enqueueInterviewPreparation(c.id, { ...consent, retry: true }),
    (error: unknown) =>
      error instanceof preparation.InterviewPreparationError &&
      error.status === 409,
  );
});

test("draft provider budget is reserved only immediately before configured drafting", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const events: string[] = [];
  process.env.GLOO_API_KEY = "synthetic-never-sent";
  try {
    const result = await preparation.runInterviewPreparationOnce("worker-a", {
      onlyId: queued.preparation.id,
      reconcile: async (current) => {
        events.push("recover");
        return recovered(current);
      },
      reserveDraftBudget: async () => {
        events.push("reserve");
      },
      draft: async (current) => {
        events.push("draft");
        return draft(current);
      },
      enqueueFilms: async () => {
        events.push("films");
        return fakeFilms();
      },
    });
    assert.equal(result?.status, "films_queued");
    assert.deepEqual(events, ["recover", "reserve", "draft", "films"]);
  } finally {
    delete process.env.GLOO_API_KEY;
  }
});

test("shutdown during claim releases the preparation attempt without provider work", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let checks = 0,
    providers = 0;
  const result = await preparation.runInterviewPreparationOnce("worker-a", {
    onlyId: queued.preparation.id,
    shouldStop: () => ++checks > 1,
    reconcile: async (current) => {
      providers++;
      return recovered(current);
    },
    draft,
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.status, "queued");
  assert.equal(result?.attempts, 0);
  assert.equal(result?.lease, undefined);
  assert.equal(result?.error, undefined);
  assert.equal(providers, 0);
});

test("a worker whose lease was replaced during recovery cannot publish progress", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const replacementToken = "replacement-worker:synthetic-token";
  let drafts = 0;
  const result = await preparation.runInterviewPreparationOnce("worker-a", {
    onlyId: queued.preparation.id,
    reconcile: async (current) => {
      await store.mutateRecord<InterviewPreparationJob>(
        queued.preparation.id,
        (saved) => ({
          ...saved!,
          lease: { token: replacementToken, expiresAt: Date.now() + 120_000 },
        }),
      );
      return recovered(current);
    },
    draft: async (current) => {
      drafts++;
      return draft(current);
    },
    enqueueFilms: fakeFilms,
  });
  assert.equal(result?.lease?.token, replacementToken);
  assert.equal(result?.status, "preparing");
  assert.equal(
    (await store.getCollection(c.id))?.interviews?.[0].turns.length,
    0,
  );
  assert.equal(drafts, 0);
});

test("three temporary preparation failures stop bounded retries with originals preserved", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let failures = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await preparation.runInterviewPreparationOnce("worker-a", {
      onlyId: queued.preparation.id,
      reconcile: async () => {
        failures++;
        throw new Error(
          "Synthetic provider failure with private debug details",
        );
      },
      draft,
      enqueueFilms: fakeFilms,
    });
    assert.equal(result?.attempts, attempt);
    assert.equal(result?.status, attempt < 3 ? "queued" : "needs_attention");
    assert.doesNotMatch(result?.error ?? "", /private debug/);
    if (attempt < 3)
      await store.mutateRecord<InterviewPreparationJob>(
        queued.preparation.id,
        (saved) => ({
          ...saved!,
          nextAttemptAt: new Date(Date.now() - 1).toISOString(),
        }),
      );
  }
  assert.equal(failures, 3);
  const stopped = (await store.getCollection(c.id))!;
  const view = await preparation.getInterviewPreparationView(stopped);
  assert.equal(view?.canRetry, false);
  assert.doesNotMatch(view?.error ?? "", /retry automatically/);
  assert.equal(
    stopped.notifications.filter(
      (notice) => notice.kind === "preparation_attention",
    ).length,
    1,
  );
  await assert.rejects(
    preparation.enqueueInterviewPreparation(c.id, { ...consent, retry: true }),
    (error: unknown) =>
      error instanceof preparation.InterviewPreparationError &&
      error.status === 409,
  );
  assert.equal(
    await preparation.runInterviewPreparationOnce("worker-b", {
      onlyId: queued.preparation.id,
    }),
    null,
  );
  assert.deepEqual(
    (await store.getCollection(c.id))?.interviews?.[0].segments,
    c.interviews![0].segments,
  );
});

test("resume after film enqueue checkpoint loss preserves ready films and review marks", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Recovery must not contact providers");
  });
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const { attachSyntheticOriginalFilms } =
    await import("./recorded-review-fixture");
  const interrupted = await preparation.runInterviewPreparationOnce(
    "crashed-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => recovered(current),
      draft,
      enqueueFilms: async (current) => {
        await attachSyntheticOriginalFilms(current);
        await store.mutateCollection(c.id, (saved) => {
          saved.chapters[0].editorialReviewed = true;
          saved.chapters[0].reviewedFilmSha256 =
            saved.chapters[0].film!.outputSha256;
          return saved;
        });
        throw new Error("Synthetic crash before preparation film checkpoint");
      },
    },
  );
  assert.equal(interrupted?.status, "queued");
  const attached = (await store.getCollection(c.id))!;
  await store.mutateRecord<InterviewPreparationJob>(
    queued.preparation.id,
    (job) => ({ ...job!, nextAttemptAt: undefined }),
  );
  const resumed = await preparation.runInterviewPreparationOnce(
    "recovery-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async () => {
        throw new Error("Recovery checkpoint must be reused");
      },
      draft: async () => {
        throw new Error("Draft checkpoint must be reused");
      },
    },
  );
  const after = (await store.getCollection(c.id))!;
  assert.equal(resumed?.status, "films_queued");
  assert.deepEqual(after.chapters, attached.chapters);
  assert.deepEqual(after.draftHistory, attached.draftHistory);
  assert.equal(
    (await preparation.getInterviewPreparationView(after))?.ready,
    true,
  );
});

test("duplicate submission preserves a ready notice in the enqueue-to-checkpoint crash window", async () => {
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  assert.equal(queued.preparation.filmJobId, undefined);
  const notificationId = `${c.id}:films-ready:film_${"f".repeat(64)}`;
  await store.mutateCollection(c.id, (current) => {
    current.notifications.push({
      id: notificationId,
      kind: "review_ready",
      to: c.storyteller.email,
      subject: "Fictional ready notice",
      text: "An output attached before preparation checkpointed its film ID.",
      url: "https://example.test/review",
      dueAt: c.createdAt,
      status: "pending",
    });
    return current;
  });
  const repeated = await preparation.enqueueInterviewPreparation(c.id, consent);
  assert.equal(repeated.preparation.id, queued.preparation.id);
  assert.equal(
    (await store.getCollection(c.id))?.notifications[0].id,
    notificationId,
  );
});
