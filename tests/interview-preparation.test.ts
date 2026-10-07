import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, unlink } from "node:fs/promises";
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
import type { StoryFilmJob } from "../src/lib/collection/films/types";

let directory: string;
let store: typeof import("../src/lib/collection/store");
let preparation: typeof import("../src/lib/collection/interview-preparation");
let content: typeof import("../src/lib/collection/content");
let films: typeof import("../src/lib/collection/films/jobstore");
let route: typeof import("../src/app/api/collection/[id]/route");
let statusRoute: typeof import("../src/app/api/collection/[id]/preparation/route");
let access: typeof import("../src/lib/collection/access");
const consent = { processingApproved: true as const };
const sourceQuestions = [
  "Take your time. Tell me about a moment when someone’s kindness made a difference in your life.",
  "What is a decision you made while following Jesus that later changed your life for the better?",
  "When you think about helping others over the years, is there a person or a story that comes to mind?",
  "As we move to our final theme, what is one thing you most want Sam to know or remember from your life as she walks her own path?",
];

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
async function attachSyntheticInteractivePlayback(
  c: Collection,
  existing?: StoryFilmJob,
) {
  const { playbackMediaId } = await import("../src/lib/collection/playback");
  await store.putCollection(c);
  const job =
    existing ??
    (await films.enqueueAutomaticOriginalFilms(c, {
      processingApproved: true,
      outputMode: "interactive",
    }));
  for (const chapter of job.chapters) {
    const playback = {
      schemaVersion: 1 as const,
      jobId: job.id,
      chapterId: chapter.chapterId,
      mediaId: "",
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: chapter.sourceSha256,
      planSha256: "a".repeat(64),
      outputSha256: String(chapter.chapterNumber).repeat(64),
      durationMs: 10_000,
      words: [{ text: "Fictional", startMs: 0, endMs: 900 }],
      createdAt: c.createdAt,
    };
    playback.mediaId = playbackMediaId(playback);
    await store.putMedia({
      id: playback.mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "audio/mp4",
      originalName: "fictional-chapter.m4a",
      bytes: 100,
      localPath: "/synthetic-private-playback",
      createdAt: c.createdAt,
      provenance: "chapter_playback",
    });
    chapter.playback = playback;
    chapter.status = "ready";
    chapter.progress = 1;
  }
  job.status = "ready";
  await store.mutateRecord(job.id, () => job);
  await films.attachReadyFilms(job);
  return (await store.getCollection(c.id))!;
}
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
      assert.deepEqual(options, { ...consent, outputMode: "interactive" });
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

test("authenticated raw-original recovery runs before missing-area checks when the live provider saved only placeholders", async () => {
  const { recoverOriginalInterviewSpeech } =
    await import("../src/lib/collection/interview-source-recovery");
  const c = await liveFixture();
  const session = c.interviews![0];
  session.turns = sourceQuestions.map((text, sequence) => ({
    id: `question-${sequence}`,
    role: "agent",
    sequence,
    text,
    timing: "unaligned",
    capturedAt: new Date(
      Date.parse(session.startedAt) + sequence * 10_000,
    ).toISOString(),
  }));
  session.turns.push({
    id: "placeholder",
    role: "user",
    sequence: 4,
    chapterId: "q1",
    text: "...",
    capturedAt: c.createdAt,
    timing: "unaligned",
  });
  session.turns.push({
    id: "app-control",
    role: "user",
    sequence: 5,
    chapterId: "q4",
    text: "[Interview control: The user finished all four parts.]",
    capturedAt: c.createdAt,
    timing: "unaligned",
  });
  await store.putCollection(c);
  const response = await route.POST(request(c), {
    params: Promise.resolve({ id: c.id }),
  });
  assert.equal(response.status, 202);
  const queued = (await response.json()).preparation as { id: string };
  const job = (await preparation.getInterviewPreparationJob(queued.id))!;
  const events: string[] = [];
  const originalTurns = structuredClone(session.turns);
  const result = await preparation.runInterviewPreparationOnce(
    "source-worker",
    {
      onlyId: queued.id,
      reconcile: async (current) => {
        events.push("provider");
        return current;
      },
      recoverOriginal: async (current) => {
        events.push("original");
        return recoverOriginalInterviewSpeech(current, {
          jobId: job.id,
          attempt: 1,
          processingApprovedAt: job.processingApprovedAt,
          originalMedia: job.originalMedia,
          assertCurrent: async () => {},
          readSource: async (_session, segment) => ({
            segment,
            durationMs: 40_000,
            words: [
              "Grandmother.",
              "Forgiveness.",
              "Neighbors.",
              "Listen.",
            ].map((text, index) => ({
              mediaId: segment.mediaId,
              text,
              startMs: index * 10_000 + 5000,
              endMs: index * 10_000 + 6000,
            })),
          }),
        });
      },
      draft: async (current) => {
        events.push("draft");
        return draft(current);
      },
      enqueueFilms: async () => {
        events.push("films");
        return fakeFilms();
      },
    },
  );
  assert.equal(result?.status, "films_queued");
  assert.deepEqual(events, ["provider", "original", "draft", "films"]);
  const saved = (await store.getCollection(c.id))!;
  for (const turn of originalTurns)
    assert.deepEqual(
      saved.interviews![0].turns.find((item) => item.id === turn.id),
      turn,
    );
  assert.deepEqual(saved.interviews![0].segments, session.segments);
  assert.deepEqual(
    saved.chapters.map((chapter) => chapter.content),
    ["Grandmother.", "Forgiveness.", "Neighbors.", "Listen."],
  );
});

test("source speech without a trustworthy part assignment is preserved and does not invent completion", async () => {
  const { recoverInterviewSourceWords } =
    await import("../src/lib/collection/interview-source-recovery");
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let recoveries = 0,
    drafts = 0;
  const result = await preparation.runInterviewPreparationOnce(
    "source-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => current,
      recoverOriginal: async (current) => {
        recoveries++;
        const session = current.interviews![0],
          segment = session.segments[0];
        session.turns = recoverInterviewSourceWords(session, [
          {
            segment,
            durationMs: 40_000,
            words: [
              {
                mediaId: segment.mediaId,
                text: "Grandmother.",
                startMs: 1000,
                endMs: 2000,
              },
            ],
          },
        ]);
        return current;
      },
      draft: async (current) => {
        drafts++;
        return draft(current);
      },
      enqueueFilms: fakeFilms,
    },
  );
  assert.equal(recoveries, 1);
  assert.equal(drafts, 0);
  assert.equal(result?.status, "needs_attention");
  assert.equal(result?.missingAreas?.length, 4);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.interviews![0].turns[0].text, "Grandmother.");
  assert.equal(saved.interviews![0].turns[0].chapterId, undefined);
  assert.deepEqual(saved.interviews![0].segments, c.interviews![0].segments);
});

test("a silent original stops with a source issue instead of claiming four missed answers or retrying transcription", async () => {
  const { recoverInterviewSourceWords } =
    await import("../src/lib/collection/interview-source-recovery");
  const c = await liveFixture();
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  let drafts = 0;
  const result = await preparation.runInterviewPreparationOnce(
    "source-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => current,
      recoverOriginal: async (current) => {
        const session = current.interviews![0];
        session.turns = recoverInterviewSourceWords(session, [
          { segment: session.segments[0], durationMs: 40_000, words: [] },
        ]);
        return current;
      },
      draft: async (current) => {
        drafts++;
        return draft(current);
      },
      enqueueFilms: fakeFilms,
    },
  );
  assert.equal(result?.status, "needs_attention");
  assert.match(result?.error ?? "", /did not contain recognizable speech/);
  assert.equal(result?.missingAreas, undefined);
  assert.equal(drafts, 0);
  assert.deepEqual((await store.getCollection(c.id))!.interviews, c.interviews);
});

test("a late source transcript commits only the requested retake inside the recovery checkpoint", async () => {
  let c = await liveFixture();
  c = recovered(c);
  const original = c.interviews![0];
  c.selectedTakeIds = { q2: "old-saved-q2", "q2-f1": "old-saved-followup" };
  c.interviews!.push({
    ...structuredClone(original),
    id: "replacement-session",
    replacesChapterId: "q2",
    turns: [
      {
        id: "replacement-placeholder",
        sequence: 0,
        role: "user",
        chapterId: "q2",
        text: "...",
        capturedAt: c.createdAt,
        timing: "unaligned",
      },
    ],
    excludedTurnIds: [],
  });
  await store.putCollection(c);
  const originals = structuredClone(
    c.interviews!.map((session) => session.segments),
  );
  const queued = await preparation.enqueueInterviewPreparation(c.id, consent);
  const result = await preparation.runInterviewPreparationOnce(
    "source-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => current,
      recoverOriginal: async (current) => {
        current.interviews![1].turns.push({
          id: "replacement-source",
          sequence: 1,
          role: "user",
          chapterId: "q2",
          text: "My sister helped me make that choice.",
          capturedAt: c.createdAt,
          timing: "unaligned",
        });
        return current;
      },
      draft,
      enqueueFilms: fakeFilms,
    },
  );
  assert.equal(result?.status, "films_queued");
  const saved = (await store.getCollection(c.id))!;
  assert.ok(saved.interviews![1].replacementCommittedAt);
  assert.deepEqual(saved.interviews![0].excludedTurnIds, ["fictional-turn-q2"]);
  assert.deepEqual(saved.selectedTakeIds, {});
  assert.equal(
    saved.chapters[1].content,
    "My sister helped me make that choice.",
  );
  assert.equal(saved.chapters[0].content, original.turns[0].text);
  assert.deepEqual(
    saved.interviews!.map((session) => session.segments),
    originals,
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
  saved = await attachSyntheticInteractivePlayback(saved, job);
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
  const lastPlayback = saved.chapters[3].playback;
  saved.chapters[3].playback = undefined;
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.ready,
    false,
  );
  saved.chapters[3].playback = lastPlayback;
  saved.chapters[3].playback!.outputSha256 = "f".repeat(64);
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

test("an older automatic film template can be prepared again after three preparation attempts", async () => {
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
  assert.equal(result?.status, "films_queued");
  const createdId = result!.filmJobId!;
  const created = await films.getFilmJob(createdId);
  const previousId = `film_${"ab".repeat(32)}`;
  const boundary =
    "The complete answer boundaries could not be verified. No partial-thought cut was made.";
  await store.mutateRecord<StoryFilmJob>(previousId, () => ({
    ...created!,
    id: previousId,
    templateVersion: "original-scribe-source-cleanup-orb-v4",
    status: "failed",
    attempts: 1,
    error: boundary,
    chapters: created!.chapters.map((chapter) => ({
      ...chapter,
      status: "failed" as const,
      error: boundary,
    })),
  }));
  await unlink(path.join(store.dataRoot, `${createdId}.json`));
  await store.mutateRecord<{ ids: string[] }>(
    `film-index-${c.id}`,
    (index) => ({
      ids: [...(index?.ids ?? []).filter((id) => id !== createdId), previousId],
    }),
  );
  await store.mutateRecord<InterviewPreparationJob>(
    queued.preparation.id,
    (job) => ({
      ...job!,
      status: "needs_attention",
      attempts: 3,
      filmJobId: previousId,
      error:
        "Film preparation needs a setup check. Completed films, written stories and original recordings are preserved.",
    }),
  );
  const blocked = (await store.getCollection(c.id))!;
  const before = await preparation.getInterviewPreparationView(blocked);
  assert.equal(before?.canRetry, true);
  assert.match(before?.error ?? "", /updated edit/);
  const closed = await syntheticRecordedFilmCollection();
  const closedQueued = await preparation.enqueueInterviewPreparation(
    closed.id,
    consent,
  );
  const closedRun = await preparation.runInterviewPreparationOnce(
    "current-template-worker",
    {
      onlyId: closedQueued.preparation.id,
      reconcile: async (current) => current,
      draft,
      enqueueFilms: (current, options) =>
        films.enqueueAutomaticOriginalFilms(current, options),
    },
  );
  await store.mutateRecord<InterviewPreparationJob>(
    closedQueued.preparation.id,
    (job) => ({
      ...job!,
      status: "needs_attention",
      attempts: 3,
      filmJobId: closedRun!.filmJobId,
      error:
        "Film preparation needs a setup check. Completed films, written stories and original recordings are preserved.",
    }),
  );
  await assert.rejects(
    preparation.enqueueInterviewPreparation(closed.id, {
      ...consent,
      retry: true,
    }),
    (error: unknown) =>
      error instanceof preparation.InterviewPreparationError &&
      error.status === 409,
  );
  const retry = await preparation.enqueueInterviewPreparation(c.id, {
    ...consent,
    retry: true,
  });
  assert.equal(retry.preparation.status, "queued");
  const resumed = await preparation.runInterviewPreparationOnce(
    "updated-template-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async () => {
        throw new Error("Recovery checkpoint must be reused");
      },
      draft: async () => {
        throw new Error("Draft checkpoint must be reused");
      },
      enqueueFilms: (current, options) =>
        films.enqueueAutomaticOriginalFilms(current, options),
    },
  );
  assert.equal(resumed?.status, "films_queued");
  assert.notEqual(resumed?.filmJobId, previousId);
  const next = await films.getFilmJob(resumed!.filmJobId!);
  assert.equal(next?.status, "queued");
  assert.equal(next?.templateVersion, "original-scribe-source-cleanup-orb-v8");
  assert.equal((await films.getFilmJob(previousId))?.status, "failed");
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
  const version = (await store.getCollection(c.id))!.updatedAt;
  assert.equal(
    await preparation.runInterviewPreparationOnce("worker-b", {
      onlyId: queued.preparation.id,
    }),
    null,
  );
  assert.equal(
    (await store.getCollection(c.id))!.updatedAt,
    version,
    "scanning a stopped preparation must not change the saved-answer version",
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
  const interrupted = await preparation.runInterviewPreparationOnce(
    "crashed-worker",
    {
      onlyId: queued.preparation.id,
      reconcile: async (current) => recovered(current),
      draft,
      enqueueFilms: async (current) => {
        await attachSyntheticInteractivePlayback(current);
        await store.mutateCollection(c.id, (saved) => {
          saved.chapters[0].editorialReviewed = true;
          saved.chapters[0].reviewedPlaybackSha256 =
            saved.chapters[0].playback!.outputSha256;
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

test("a newer ready film replaces a stale failed preparation film", async () => {
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
  const failedId = completed!.filmJobId!;
  await store.mutateRecord<StoryFilmJob>(failedId, (job) => ({
    ...job!,
    status: "failed",
    error:
      "A selected source word has no verified positive duration. Its original is preserved for review; no automatic cut or caption was made.",
  }));
  let saved = (await store.getCollection(c.id))!;
  assert.equal(
    (await preparation.getInterviewPreparationView(saved))?.status,
    "needs_attention",
  );
  saved.chapters[0].content += " A later correction.";
  await store.putCollection(saved);
  const next = await films.enqueueAutomaticOriginalFilms(saved, {
    processingApproved: true,
    outputMode: "interactive",
  });
  assert.notEqual(next.id, failedId);
  saved = await attachSyntheticInteractivePlayback(
    (await store.getCollection(c.id))!,
    next,
  );
  const view = await preparation.getInterviewPreparationView(saved);
  assert.equal(view?.ready, true);
  assert.equal(view?.filmJobId, next.id);
  assert.notEqual(view?.status, "needs_attention");
  assert.equal(view?.error, undefined);
});
