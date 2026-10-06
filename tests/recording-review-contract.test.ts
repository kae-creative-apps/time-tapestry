import assert from "node:assert/strict";
import { before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { prepareCollection } from "../src/lib/collection/create";
import { draftChapters, selectedAnswers } from "../src/lib/collection/content";
import type { Collection, StoredMedia } from "../src/lib/collection/types";
import {
  attachSyntheticOriginalFilms,
  recordedApproval,
} from "./recorded-review-fixture";

let store: typeof import("../src/lib/collection/store");
let media: typeof import("../src/lib/collection/media");
let post: typeof import("../src/app/api/collection/[id]/route").POST;
let transcribe: typeof import("../src/app/api/collection/[id]/transcribe/route").POST;
let interview: typeof import("../src/app/api/collection/[id]/interview/route").POST;
before(async () => {
  for (const key of [
    "GLOO_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL",
    "OPENAI_API_KEY",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_TEST_BYPASS: "true",
    SECURITY_LOCAL_BYPASS: "true",
    COLLECTION_DATA_DIR: await mkdtemp(
      path.join(os.tmpdir(), "recording-review-contract-"),
    ),
  });
  store = await import("../src/lib/collection/store");
  media = await import("../src/lib/collection/media");
  post = (await import("../src/app/api/collection/[id]/route")).POST;
  transcribe = (await import("../src/app/api/collection/[id]/transcribe/route"))
    .POST;
  interview = (await import("../src/app/api/collection/[id]/interview/route"))
    .POST;
});
const context = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });
const req = (c: Collection, body: unknown, suffix = "") =>
  new NextRequest(
    `http://localhost/api/collection/${c.id}${suffix}?key=${c.ownerKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
async function act(c: Collection, body: unknown) {
  const response = await post(req(c, body), context(c));
  return { status: response.status, body: await response.json() };
}
async function fixture() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Alex Example", email: "alex@example.test" },
    recipient: { name: "Sam Example", email: "sam@example.test" },
  });
  await store.putCollection(c);
  return c;
}
async function source(c: Collection, text?: string) {
  const m = await media.saveLocalMedia(
    c.id,
    "owner",
    new File(["synthetic recorded bytes"], "answer.webm", {
      type: "audio/webm",
    }),
  );
  if (text) {
    m.transcription = {
      text,
      provider: "openai",
      model: "whisper-1",
      completedAt: c.createdAt,
    };
    await store.putMedia(m);
  }
  return m;
}
const takeFor = (m: StoredMedia, questionId = "q1") => ({
  id: randomUUID(),
  questionId,
  kind: "voice",
  mediaId: m.id,
  prompt: "A recorded answer",
  text: "",
});

test("transcription is persisted by the provider route and client text cannot create or change answers", async () => {
  const c = await fixture(),
    m = await source(c),
    take = takeFor(m);
  assert.equal(
    (
      await act(c, {
        action: "save_take",
        take: { ...take, text: "Invented words" },
      })
    ).status,
    400,
  );
  assert.equal((await act(c, { action: "save_take", take })).status, 200);
  const originalFetch = global.fetch;
  let calls = 0;
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  global.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("data:")) return originalFetch(input, init);
    assert.match(url, /\/audio\/transcriptions$/);
    calls++;
    return Response.json({ text: "My recorded words from the provider." });
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await transcribe(
        req(c, { mediaId: m.id, takeId: take.id }, "/transcribe"),
        context(c),
      );
      assert.equal(result.status, 200, await result.clone().text());
      assert.equal(
        (await result.json()).text,
        "My recorded words from the provider.",
      );
    }
    assert.equal(calls, 1, "retry reuses the server transcript");
  } finally {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  }
  const saved = (await store.getCollection(c.id))!;
  assert.equal(saved.takes[0].text, "My recorded words from the provider.");
  assert.equal(saved.takes[0].transcriptionStatus, "ready");
  assert.equal(
    (await store.getMedia(m.id))!.transcription!.text,
    saved.takes[0].text,
  );
  assert.equal(
    (
      await act(c, {
        action: "save_take",
        take: { ...take, text: "An edited answer" },
      })
    ).status,
    400,
  );
  assert.equal((await act(c, { action: "save_take", take })).status, 200);
  assert.equal(
    (await store.getCollection(c.id))!.takes[0].text,
    saved.takes[0].text,
  );
  const unrelated = await source(c);
  assert.equal(
    (
      await transcribe(
        req(c, { mediaId: unrelated.id, takeId: take.id }, "/transcribe"),
        context(c),
      )
    ).status,
    400,
  );
});

test("a recorded chapter retake atomically replaces old saved and live answers without deleting originals", async () => {
  const c = await fixture(),
    old = await source(c, "Earlier recorded answer"),
    replacement = await source(c, "My replacement recording");
  const priorTake = takeFor(old),
    followup = takeFor(old, "q1-f1");
  assert.equal(
    (await act(c, { action: "save_take", take: priorTake })).status,
    200,
  );
  assert.equal(
    (await act(c, { action: "save_take", take: followup })).status,
    200,
  );
  const sessionId = randomUUID(),
    turnId = randomUUID();
  await store.mutateCollection(c.id, (current) => {
    current.interviews = [
      {
        id: sessionId,
        provider: "elevenlabs",
        status: "completed",
        startedAt: c.createdAt,
        turns: [
          {
            id: turnId,
            sequence: 0,
            role: "user",
            text: "Old live answer",
            capturedAt: c.createdAt,
            chapterId: "q1",
            timing: "unaligned",
          },
        ],
        segments: [
          {
            id: randomUUID(),
            mediaId: old.id,
            startMs: 0,
            durationMs: 1000,
            kind: "voice",
            createdAt: c.createdAt,
          },
        ],
        excludedTurnIds: [],
      },
    ];
    return current;
  });
  const nextTake = takeFor(replacement);
  const body = { action: "save_take", replaceChapterId: "q1", take: nextTake };
  assert.equal((await act(c, body)).status, 200);
  assert.equal((await act(c, body)).status, 200);
  const saved = (await store.getCollection(c.id))!;
  assert.deepEqual(
    selectedAnswers(saved, "q1").map((answer) => answer.id),
    [nextTake.id],
  );
  assert.deepEqual(saved.interviews![0].excludedTurnIds, [turnId]);
  assert.equal(saved.takes.length, 3);
  assert.ok(await store.getMedia(old.id));
  assert.equal(saved.selectedTakeIds["q1-f1"], undefined);
  assert.equal((await act(c, { ...body, replaceChapterId: "q2" })).status, 400);
  assert.equal(
    (
      await act(c, {
        action: "save_take",
        take: { ...nextTake, mediaId: old.id },
      })
    ).status,
    400,
  );
});

test("retired text editors return 410 while active provider transcript corrections remain available", async () => {
  const c = await fixture();
  for (const action of [
    "edit_chapter",
    "blessing",
    "correct_turn",
    "attach_video",
  ])
    assert.equal(
      (await act(c, { action, chapterId: "q1", content: "Edited", value: {} }))
        .status,
      410,
    );
  const sessionId = randomUUID();
  assert.equal(
    (
      await interview(
        req(c, { action: "correct_turn", sessionId }, "/interview"),
        context(c),
      )
    ).status,
    410,
  );
  const turnId = randomUUID();
  await store.mutateCollection(c.id, (current) => {
    current.interviews = [
      {
        id: sessionId,
        provider: "elevenlabs",
        status: "completed",
        startedAt: c.createdAt,
        segments: [],
        excludedTurnIds: [],
        turns: [
          {
            id: turnId,
            sequence: 0,
            role: "user",
            text: "Saved words",
            capturedAt: c.createdAt,
            chapterId: "q1",
            timing: "unaligned",
          },
        ],
      },
    ];
    return current;
  });
  const correction = {
    id: randomUUID(),
    sequence: 1,
    role: "user",
    text: "Changed words",
    chapterId: "q1",
    capturedAt: c.createdAt,
    timing: "unaligned",
    supersedesTurnId: turnId,
  };
  assert.equal(
    (
      await interview(
        req(
          c,
          { action: "append_turns", sessionId, turns: [correction] },
          "/interview",
        ),
        context(c),
      )
    ).status,
    410,
  );
  await store.mutateCollection(c.id, (current) => {
    current.interviews![0].status = "active";
    return current;
  });
  assert.equal(
    (
      await interview(
        req(
          c,
          { action: "append_turns", sessionId, turns: [correction] },
          "/interview",
        ),
        context(c),
      )
    ).status,
    200,
  );
});

test("final approval requires all four current original film hashes and sets review flags atomically", async () => {
  let c = await fixture();
  for (let i = 1; i <= 4; i++) {
    const m = await source(c, `My recorded story for part ${i}.`);
    assert.equal(
      (await act(c, { action: "save_take", take: takeFor(m, `q${i}`) })).status,
      200,
    );
  }
  c = (await store.getCollection(c.id))!;
  c.chapters = await draftChapters(c);
  c.status = "draft";
  await store.putCollection(c);
  assert.equal(
    (
      await act(c, {
        action: "approve",
        deliveryMode: "digital",
        allowWrittenOnly: true,
        recordingsReviewed: true,
      })
    ).status,
    400,
  );
  c = await attachSyntheticOriginalFilms(c);
  const approval = {
    action: "approve",
    deliveryMode: "digital",
    ...recordedApproval(c),
  };
  assert.equal(
    (await act(c, { ...approval, recordingsReviewed: false })).status,
    400,
  );
  assert.equal(
    (
      await act(c, {
        ...approval,
        reviewedFilmHashes: {
          ...approval.reviewedFilmHashes,
          q4: "f".repeat(64),
        },
      })
    ).status,
    400,
  );
  assert.ok(
    (await store.getCollection(c.id))!.chapters.every(
      (chapter) => !chapter.editorialReviewed,
    ),
  );
  const original = (await store.getMedia(c.takes[0].mediaId!))!;
  await store.putMedia({ ...original, bytes: original.bytes + 1 });
  assert.equal(
    (await act(c, approval)).status,
    400,
    "changed source metadata invalidates current film job",
  );
  await store.putMedia(original);
  const approved = await act(c, approval);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const frozen = (await store.getCollection(c.id))!;
  assert.equal(frozen.status, "approved");
  assert.ok(
    frozen.chapters.every(
      (chapter) =>
        chapter.editorialReviewed &&
        chapter.reviewedFilmSha256 === chapter.film!.outputSha256,
    ),
  );
  assert.equal((await act(c, { action: "approve" })).status, 200);
  assert.deepEqual(
    (await store.getCollection(c.id))!.notifications,
    frozen.notifications,
  );
});

test("automatic postcards still queue one primary collection email on approval without releasing print delivery", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error(
      "Approval must queue notifications without contacting providers.",
    );
  });
  let c = await fixture();
  for (let i = 1; i <= 4; i++) {
    const m = await source(c, `My recorded story for part ${i}.`);
    assert.equal(
      (await act(c, { action: "save_take", take: takeFor(m, `q${i}`) })).status,
      200,
    );
  }
  c = (await store.getCollection(c.id))!;
  c.chapters = await draftChapters(c);
  c.status = "draft";
  c = await attachSyntheticOriginalFilms(c);
  const body = {
    action: "approve",
    deliveryMode: "digital",
    autoPostcards: true,
    ...recordedApproval(c),
  };
  assert.equal((await act(c, body)).status, 200);
  assert.equal((await act(c, body)).status, 200);
  const saved = (await store.getCollection(c.id))!;
  const ready = saved.notifications.filter(
    (notification) => notification.kind === "collection_ready",
  );
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, `${c.id}:digital-ready`);
  assert.equal(ready[0].recipientId, "primary");
  assert.equal(ready[0].to, c.recipient.email);
  assert.ok(ready[0].url.endsWith(`/collection/${c.id}`));
  assert.equal(ready[0].url.includes("?key="), false);
  assert.equal(ready[0].status, "pending");
  assert.equal(saved.autoPostcards, true);
  assert.equal(saved.addressConfirmed, false);
  assert.deepEqual(saved.deliveries, []);
  assert.equal(saved.postcardProof, undefined);
  assert.equal(
    saved.notifications.filter(
      (notification) => notification.kind === "address_request",
    ).length,
    1,
  );
  assert.match(
    saved.notifications.find(
      (notification) => notification.id === `${c.id}:owner-approved`,
    )!.text,
    /approve their printed designs/,
  );
  assert.equal(calls, 0);
});
