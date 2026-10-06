import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { CHAPTERS } from "../src/lib/interview-state";
import { interviewAnswers } from "../src/lib/collection/interview";
import { hasRecordedAnswerSource } from "../src/lib/collection/recording-validation";
import { syntheticFilmCollection } from "./film-fixture";
import type {
  Collection,
  InterviewChapterId,
} from "../src/lib/collection/types";
import type { InterviewRestorationAudit } from "../src/lib/collection/interview-restoration";

let directory: string;
let store: typeof import("../src/lib/collection/store");
let restoration: typeof import("../src/lib/collection/interview-restoration");
let preparation: typeof import("../src/lib/collection/interview-preparation");
let content: typeof import("../src/lib/collection/content");
let access: typeof import("../src/lib/collection/access");
let route: typeof import("../src/app/api/collection/[id]/route");

before(async () => {
  directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-restoration-tests-"),
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
  restoration = await import("../src/lib/collection/interview-restoration");
  preparation = await import("../src/lib/collection/interview-preparation");
  content = await import("../src/lib/collection/content");
  access = await import("../src/lib/collection/access");
  route = await import("../src/app/api/collection/[id]/route");
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const c = syntheticFilmCollection();
  c.status = "recording";
  c.chapters = [];
  c.takes = [];
  c.selectedTakeIds = {};
  c.explicitTakeSelections = {};
  const mediaId = `original_${randomUUID()}`;
  await store.putMedia({
    id: mediaId,
    collectionId: c.id,
    role: "owner",
    mimeType: "video/webm",
    originalName: "fictional-conversation.webm",
    bytes: 1024,
    createdAt: c.createdAt,
    provenance: "uploaded_recording",
    url: "https://recording.example.test/fictional.webm",
  });
  c.interviews = [
    {
      id: `session_${randomUUID()}`,
      provider: "elevenlabs",
      status: "completed",
      startedAt: c.createdAt,
      endedAt: c.createdAt,
      providerConversationId: `conversation_${randomUUID()}`,
      turns: CHAPTERS.map((chapter, index) => ({
        id: `turn_${randomUUID()}`,
        role: "user",
        sequence: index,
        text: `A fictional original memory for ${chapter.id}.`,
        chapterId: chapter.id as InterviewChapterId,
        capturedAt: c.createdAt,
        timing: "unaligned",
      })),
      excludedTurnIds: [],
      segments: [
        {
          id: `segment_${randomUUID()}`,
          mediaId,
          kind: "video",
          startMs: 0,
          durationMs: 60_000,
          createdAt: c.createdAt,
        },
      ],
    },
  ];
  c.interviews[0].excludedTurnIds = c.interviews[0].turns.map(
    (turn) => turn.id,
  );
  for (const chapter of CHAPTERS) {
    const id = `retake_${randomUUID()}`;
    const replacementMedia = `original_${randomUUID()}`;
    await store.putMedia({
      id: replacementMedia,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/webm",
      originalName: "fictional-later-retake.webm",
      bytes: 512,
      createdAt: c.createdAt,
      provenance: "uploaded_recording",
      url: "https://recording.example.test/fictional-later.webm",
    });
    c.takes.push({
      id,
      questionId: chapter.id,
      prompt: chapter.title,
      kind: "video",
      text: "",
      mediaId: replacementMedia,
      createdAt: c.createdAt,
      replacesChapterId: chapter.id as InterviewChapterId,
      transcriptionStatus: "pending",
    });
    c.selectedTakeIds[chapter.id] = id;
    c.explicitTakeSelections[chapter.id] = true;
  }
  await store.putCollection(c);
  return c;
}
function options(c: Collection) {
  return {
    sessionId: c.interviews![0].id,
    expectedUpdatedAt: c.updatedAt,
    processingApproved: true as const,
    authorize: async (current: Collection) => {
      access.requireOwner(current, "owner");
    },
  };
}
function request(
  c: Collection,
  body: Record<string, unknown>,
  key = c.ownerKey,
) {
  return new NextRequest(`http://localhost/api/collection/${c.id}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "restore_interview",
      sessionId: c.interviews![0].id,
      expectedUpdatedAt: c.updatedAt,
      processingApproved: true,
      ...body,
    }),
  });
}

test("explicit full-interview restoration preserves all raw recordings and privately backs up prior choices", async () => {
  const c = await fixture();
  const result = await restoration.restoreCompletedInterview(c.id, options(c));
  assert.deepEqual(result.collection.takes, c.takes);
  assert.deepEqual(
    result.collection.interviews![0].turns,
    c.interviews![0].turns,
  );
  assert.deepEqual(
    result.collection.interviews![0].segments,
    c.interviews![0].segments,
  );
  assert.deepEqual(result.collection.interviews![0].excludedTurnIds, []);
  assert.deepEqual(result.collection.selectedTakeIds, {});
  assert.deepEqual(result.collection.explicitTakeSelections, {});
  assert.equal(result.restoration.clearedReplacementSelectionsCount, 4);
  assert.equal(result.restoration.preservedTakeCount, 4);
  for (const chapter of CHAPTERS)
    assert.equal(
      content.selectedAnswers(result.collection, chapter.id).length,
      1,
    );
  const backup = await store.readRecord<InterviewRestorationAudit>(
    result.restoration.id,
  );
  assert.deepEqual(backup!.prior.takes, c.takes);
  assert.deepEqual(backup!.prior.interviews, c.interviews);
  assert.deepEqual(backup!.prior.selectedTakeIds, c.selectedTakeIds);
  assert.equal(backup!.originalMedia.length, 1);
  for (const role of ["owner", "requester", "recipient"] as const)
    assert.equal(
      JSON.stringify(access.publicView(result.collection, role)).includes(
        "interview-source-restoration",
      ),
      false,
    );
  assert.equal(JSON.stringify(backup).includes(c.ownerKey), false);
  for (const take of c.takes) assert.ok(await store.getMedia(take.mediaId!));
});

test("original verification reads each unique segment once and uses only verified sources for every answer", async () => {
  const c = await fixture();
  const session = c.interviews![0];
  const original = (await store.getMedia(session.segments[0].mediaId))!;
  for (let i = 1; i < 4; i++) {
    const id = `original_${randomUUID()}`;
    await store.putMedia({ ...original, id });
    session.segments.push({
      ...session.segments[0],
      id: `segment_${randomUUID()}`,
      mediaId: id,
      startMs: i * 60_000,
    });
  }
  session.segments.push({
    ...session.segments[0],
    id: `segment_${randomUUID()}`,
    startMs: 240_000,
  });
  session.turns = Array.from({ length: 24 }, (_, index) => ({
    ...session.turns[index % 4],
    id: `turn_${randomUUID()}`,
    sequence: index,
  }));
  session.excludedTurnIds = [];
  const reads: string[] = [];
  const verified = await restoration.verifiedInterviewMedia(
    c,
    session,
    async (id) => {
      reads.push(id);
      return store.getMedia(id);
    },
  );
  assert.equal(reads.length, 4);
  assert.equal(new Set(reads).size, 4);
  assert.equal(verified.size, 4);
  for (const chapter of CHAPTERS)
    for (const answer of interviewAnswers(c, chapter.id))
      assert.equal(
        await hasRecordedAnswerSource(
          answer,
          c,
          async (id) => verified.get(id) ?? null,
        ),
        true,
      );
  assert.equal(reads.length, 4);
  const answer = interviewAnswers(c, "q1")[0];
  answer.liveSource!.sourceRanges.push({
    segmentId: "unverified_segment",
    mediaId: "unverified_original",
  });
  assert.equal(
    await hasRecordedAnswerSource(
      answer,
      c,
      async (id) => verified.get(id) ?? null,
    ),
    false,
  );
  await assert.rejects(
    restoration.verifiedInterviewMedia(c, session, async () => ({
      ...original,
      id: "wrong_record_binding",
    })),
    /could not be verified/,
  );
});

test("restoration rejects stale choices, approved collections and nonowner authorization without changing sources", async () => {
  const c = await fixture();
  await assert.rejects(
    restoration.restoreCompletedInterview(c.id, {
      ...options(c),
      expectedUpdatedAt: "old",
    }),
    /changed/,
  );
  await assert.rejects(
    restoration.restoreCompletedInterview(c.id, {
      ...options(c),
      authorize: async (current) => {
        access.requireOwner(current, "recipient");
      },
    }),
  );
  assert.deepEqual(await store.getCollection(c.id), c);
  c.status = "approved";
  await store.putCollection(c);
  await assert.rejects(
    restoration.restoreCompletedInterview(c.id, options(c)),
    /approved/i,
  );
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("restoration requires completed four-area words and verified original recordings", async (t) => {
  for (const variant of [
    "active",
    "guided",
    "missing_words",
    "blank_words",
    "missing_media",
    "generated_media",
    "foreign_media",
    "no_segments",
    "bad_duration",
  ] as const)
    await t.test(variant, async () => {
      const c = await fixture();
      const session = c.interviews![0];
      if (variant === "active") session.status = "active";
      if (variant === "guided") session.provider = "guided";
      if (variant === "missing_words")
        session.turns = session.turns.slice(0, 3);
      if (variant === "blank_words") session.turns[3].text = " ";
      if (variant === "missing_media")
        session.segments[0].mediaId = "missing_original";
      if (variant === "no_segments") session.segments = [];
      if (variant === "bad_duration") session.segments[0].durationMs = 0;
      if (variant === "generated_media" || variant === "foreign_media") {
        const media = (await store.getMedia(session.segments[0].mediaId))!;
        await store.putMedia({
          ...media,
          ...(variant === "generated_media"
            ? { provenance: "generated_film" as const }
            : { collectionId: "another_collection" }),
        });
      }
      await store.putCollection(c);
      await assert.rejects(
        restoration.restoreCompletedInterview(c.id, options(c)),
      );
      assert.deepEqual(await store.getCollection(c.id), c);
    });
});

test("restoration cannot discard unrelated selected takes or restore superseded partial answers", async () => {
  const c = await fixture();
  delete c.takes[0].replacesChapterId;
  await store.putCollection(c);
  await assert.rejects(
    restoration.restoreCompletedInterview(c.id, options(c)),
    /separately selected/,
  );
  assert.deepEqual(await store.getCollection(c.id), c);
  c.takes[0].replacesChapterId = "q1";
  c.interviews![0].turns[1].supersedesTurnId = c.interviews![0].turns[0].id;
  await store.putCollection(c);
  await assert.rejects(
    restoration.restoreCompletedInterview(c.id, options(c)),
    /corrected answers/,
  );
  assert.deepEqual(await store.getCollection(c.id), c);
});

test("restoration changes only the chosen session and invalidates prior draft reviews", async () => {
  const c = await fixture();
  const other = structuredClone(c.interviews![0]);
  other.id = `session_${randomUUID()}`;
  c.interviews!.push(other);
  c.chapters = CHAPTERS.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    content: "An older fictional draft.",
    postcardNote: "An older fictional note.",
    sourceTakeIds: [],
    videoStatus: "not_requested",
    editorialReviewed: true,
    generatedWith: "source_text",
    reviewedFilmSha256: "a".repeat(64),
  }));
  await store.putCollection(c);
  const result = await restoration.restoreCompletedInterview(c.id, options(c));
  assert.deepEqual(result.collection.interviews![1], other);
  assert.equal(result.collection.draftOutdated, true);
  for (const chapter of result.collection.chapters) {
    assert.equal(chapter.editorialReviewed, false);
    assert.equal(chapter.reviewedFilmSha256, undefined);
    assert.equal(chapter.content, "An older fictional draft.");
  }
});

test("owner route persists restored choices and durably queues preparation without provider calls or audit disclosure", async (t) => {
  const provider = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected provider call");
  });
  const c = await fixture();
  const response = await route.POST(request(c, {}), {
    params: Promise.resolve({ id: c.id }),
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.preparation.status, "queued");
  assert.equal(body.preparation.ready, false);
  assert.equal(body.restoration, undefined);
  assert.equal(body.collection.ownerKey, undefined);
  assert.equal(
    JSON.stringify(body).includes("interview-source-restoration"),
    false,
  );
  assert.ok(await preparation.getInterviewPreparationJob(body.preparation.id));
  assert.equal(provider.mock.callCount(), 0);
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.takes.length, 4);
  assert.deepEqual(saved.selectedTakeIds, {});
  const job = await preparation.runInterviewPreparationOnce(
    "fictional-restore-worker",
    {
      onlyId: body.preparation.id,
      reconcile: async (current) => current,
      draft: async (current) => content.draftChapters(current),
      enqueueFilms: async () => ({ id: `film_${"c".repeat(64)}` }),
    },
  );
  assert.equal(job!.status, "films_queued");
  assert.equal((await store.getCollection(c.id))!.chapters.length, 4);
  assert.equal(provider.mock.callCount(), 0);
});

test("route requires owner consent and the current source version", async () => {
  for (const variant of [
    "recipient",
    "consent",
    "version",
    "missing_version",
  ] as const) {
    const c = await fixture();
    const response = await route.POST(
      request(
        c,
        variant === "consent"
          ? { processingApproved: false }
          : variant === "version"
            ? { expectedUpdatedAt: "old" }
            : variant === "missing_version"
              ? { expectedUpdatedAt: undefined }
              : {},
        variant === "recipient" ? c.recipientKey : c.ownerKey,
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
    assert.equal(
      response.status,
      variant === "version" ? 409 : variant === "recipient" ? 404 : 400,
    );
    assert.deepEqual(await store.getCollection(c.id), c);
  }
});
