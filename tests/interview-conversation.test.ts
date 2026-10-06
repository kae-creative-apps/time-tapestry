import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";
import { interviewAnswers } from "../src/lib/collection/interview";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";

let create: any, post: any, legacyPost: any, get: any, store: any, content: any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, body?: unknown, cookie?: string) =>
  new NextRequest(`http://localhost${url}`, {
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
  });
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  for (const name of [
    "GLOO_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_AGENT_ID",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
  ])
    delete process.env[name];
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "time-tapestry-conversation-"),
  );
  create = (await import("../src/app/api/collection/route")).POST;
  post = (await import("../src/app/api/collection/[id]/interview/route")).POST;
  const legacy = await import("../src/app/api/collection/[id]/route");
  legacyPost = legacy.POST;
  get = legacy.GET;
  store = await import("../src/lib/collection/store");
  content = await import("../src/lib/collection/content");
});
async function make(): Promise<Collection> {
  const response = await create(
    request("/api/collection", {
      initiationPath: "share",
      storyteller: { name: "Test storyteller", email: "story@example.com" },
      recipient: { name: "Test recipient", email: "recipient@example.com" },
    }),
  );
  assert.equal(response.status, 201);
  return store.getCollection((await response.json()).collection.id);
}
async function act(c: Collection, body: unknown, key = c.ownerKey) {
  const response = await post(
    request(`/api/collection/${c.id}/interview?key=${key}`, body),
    params(c.id),
  );
  return { status: response.status, body: await response.json() };
}
const turn = (sequence: number, text: string, chapterId = "q1") => ({
  id: randomUUID(),
  sequence,
  role: "user",
  text,
  chapterId,
  capturedAt: "2026-10-02T12:00:00.000Z",
  timing: "unaligned",
});
async function start(c: Collection, provider = "elevenlabs") {
  const sessionId = randomUUID();
  assert.equal(
    (await act(c, { action: "start", sessionId, provider })).status,
    200,
  );
  return sessionId;
}

test("every accepted conversational answer reaches its hidden story without replacing legacy retakes", async () => {
  const c = await make();
  const oldTake = {
    id: randomUUID(),
    questionId: "q1",
    prompt: "Original question",
    kind: "text",
    text: "Legacy selected answer",
  };
  // Historical text remains readable, but new typed interviews are no longer accepted.
  await store.mutateCollection(c.id, (current: Collection) => {
    current.takes.push({
      ...oldTake,
      kind: "text",
      createdAt: current.createdAt,
    });
    current.selectedTakeIds.q1 = oldTake.id;
    return current;
  });
  const sessionId = await start(c);
  const agent = { ...turn(0, "Tell me about her kindness."), role: "agent" };
  const first = turn(1, "My neighbor helped me learn to read.");
  const second = turn(2, "She visited every Tuesday.");
  const turns = [
    agent,
    first,
    second,
    turn(3, "Jesus taught me to listen.", "q2"),
    turn(4, "I offered my time.", "q3"),
    turn(5, "I hope you remember to notice people.", "q4"),
  ];
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns })).status,
    200,
  );
  const current = await store.getCollection(c.id);
  const answers = content.selectedAnswers(current, "q1");
  assert.deepEqual(
    answers.map((item: any) => item.text),
    [oldTake.text, first.text, second.text],
  );
  assert.equal(answers[1].prompt, agent.text);
  assert.equal(current.selectedTakeIds.q1, oldTake.id);
  assert.equal(current.takes.length, 1);
  const chapters = await content.draftChapters(current);
  assert.equal(chapters.length, 4);
  assert.deepEqual(chapters[0].sourceTakeIds, [
    oldTake.id,
    `live-${first.id}`,
    `live-${second.id}`,
  ]);
  assert.ok(!chapters[0].content.includes(agent.text));
});

test("turn retries are idempotent and conflicting retries or partial batches never overwrite originals", async () => {
  const c = await make();
  const sessionId = await start(c);
  const first = turn(0, "This is my original memory.");
  const body = { action: "append_turns", sessionId, turns: [first] };
  assert.equal((await act(c, body)).status, 200);
  assert.equal((await act(c, body)).status, 200);
  assert.equal(
    (await act(c, { ...body, turns: [{ ...first, text: "Overwritten" }] }))
      .status,
    409,
  );
  assert.equal(
    (
      await act(c, {
        ...body,
        turns: [
          turn(1, "Must not partially save."),
          { ...first, text: "Conflict" },
        ],
      })
    ).status,
    409,
  );
  const current = await store.getCollection(c.id);
  assert.equal(current.interviews[0].turns.length, 1);
  assert.equal(current.interviews[0].turns[0].text, first.text);
});

test("corrections preserve source words and exclusions affect drafts only", async () => {
  const c = await make();
  const sessionId = await start(c);
  const first = turn(0, "It happened in 1970.");
  const correction = {
    ...turn(1, "It happened in 1971."),
    supersedesTurnId: first.id,
  };
  assert.equal(
    (
      await act(c, {
        action: "append_turns",
        sessionId,
        turns: [first, correction],
      })
    ).status,
    200,
  );
  let current = await store.getCollection(c.id);
  assert.equal(current.interviews[0].turns.length, 2);
  assert.deepEqual(
    interviewAnswers(current, "q1").map((item) => item.text),
    [correction.text],
  );
  assert.equal(
    (
      await act(c, {
        action: "select_turn",
        sessionId,
        turnId: correction.id,
        included: false,
      })
    ).status,
    200,
  );
  current = await store.getCollection(c.id);
  assert.equal(interviewAnswers(current, "q1").length, 0);
  assert.equal(current.interviews[0].turns[0].text, first.text);
});

test("correcting an excluded answer keeps the replacement excluded until explicitly included", async () => {
  const c = await make();
  const sessionId = await start(c);
  const first = turn(0, "An experience I do not want in the gift.");
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns: [first] }))
      .status,
    200,
  );
  assert.equal(
    (
      await act(c, {
        action: "select_turn",
        sessionId,
        turnId: first.id,
        included: false,
      })
    ).status,
    200,
  );
  const correction = {
    ...turn(1, "A corrected detail in the excluded experience."),
    supersedesTurnId: first.id,
  };
  const body = { action: "append_turns", sessionId, turns: [correction] };
  assert.equal((await act(c, body)).status, 200);
  assert.equal((await act(c, body)).status, 200);
  let current = await store.getCollection(c.id);
  assert.deepEqual(interviewAnswers(current, "q1"), []);
  assert.deepEqual(current.interviews[0].excludedTurnIds, [
    first.id,
    correction.id,
  ]);
  assert.equal(current.interviews[0].turns.length, 2);
  assert.equal(current.interviews[0].turns[0].text, first.text);
  assert.equal(
    (
      await act(c, {
        action: "select_turn",
        sessionId,
        turnId: correction.id,
        included: true,
      })
    ).status,
    200,
  );
  current = await store.getCollection(c.id);
  assert.deepEqual(
    interviewAnswers(current, "q1").map((answer) => answer.text),
    [correction.text],
  );
  assert.deepEqual(current.interviews[0].excludedTurnIds, [first.id]);
});

test("recipient and requester cannot append, read transcripts or see archival references", async () => {
  const c = await make();
  const sessionId = await start(c);
  await act(c, {
    action: "append_turns",
    sessionId,
    turns: [turn(0, "Private interview words.")],
  });
  const oldRecipientLink = await get(
    request(`/api/collection/${c.id}?key=${c.recipientKey}`),
    params(c.id),
  );
  assert.equal(oldRecipientLink.status, 404);
  const denied = await oldRecipientLink.json();
  assert.equal(denied.collection, undefined);
  assert.ok(!JSON.stringify(denied).includes("Private interview words"));
  const recipientCookie = await verifiedRecipientCookie(c.recipient.email);
  for (const key of [c.recipientKey, c.requesterKey]) {
    assert.equal(
      (
        await act(
          c,
          { action: "set_status", sessionId, status: "completed" },
          key,
        )
      ).status,
      403,
    );
    const result = await get(
      key === c.recipientKey
        ? request(`/api/collection/${c.id}`, undefined, recipientCookie)
        : request(`/api/collection/${c.id}?key=${key}`),
      params(c.id),
    );
    assert.equal(result.status, 200);
    const json = await result.json();
    assert.equal(json.collection.interviews, undefined);
    assert.ok(!JSON.stringify(json).includes("Private interview words"));
  }
  assert.equal(
    (await act(c, { action: "start", sessionId: randomUUID() }, "wrong"))
      .status,
    404,
  );
  await store.mutateCollection(c.id, (current: Collection) => ({
    ...current,
    status: "approved",
  }));
  assert.equal(
    (
      await act(c, {
        action: "append_turns",
        sessionId,
        turns: [turn(1, "Late words")],
      })
    ).status,
    400,
  );
});

test("original segments are owner-scoped, idempotent and projected as estimated ranges across boundaries", async () => {
  const c = await make();
  const sessionId = await start(c);
  const mediaIds = [randomUUID(), randomUUID()];
  for (const id of mediaIds)
    await store.putMedia({
      id,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/webm",
      originalName: "synthetic.webm",
      bytes: 10,
      localPath: path.join(store.dataRoot, "media", id),
      createdAt: c.createdAt,
    });
  const segments = mediaIds.map((mediaId, index) => ({
    id: randomUUID(),
    localTakeId: randomUUID(),
    mediaId,
    kind: "video",
    startMs: index * 10_000,
    durationMs: 10_000,
  }));
  for (const segment of segments) {
    assert.equal(
      (await act(c, { action: "attach_segment", sessionId, segment })).status,
      200,
    );
    assert.equal(
      (await act(c, { action: "attach_segment", sessionId, segment })).status,
      200,
    );
  }
  assert.equal(
    (
      await act(c, {
        action: "attach_segment",
        sessionId,
        segment: { ...segments[0], durationMs: 9000 },
      })
    ).status,
    409,
  );
  const answer = {
    ...turn(0, "A memory spanning two original recordings."),
    startMs: 8_000,
    endMs: 12_000,
    timing: "estimated",
  };
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns: [answer] }))
      .status,
    200,
  );
  const current = await store.getCollection(c.id);
  const projected = interviewAnswers(current, "q1")[0];
  assert.deepEqual(
    projected.liveSource!.sourceRanges.map(({ inMs, outMs }) => [inMs, outMs]),
    [
      [8000, 10000],
      [0, 2000],
    ],
  );
  assert.equal(projected.mediaId, undefined);
  assert.equal(projected.liveSource!.timing, "estimated");
  assert.equal(current.interviews[0].segments.length, 2);
  const foreign = randomUUID();
  await store.putMedia({
    id: foreign,
    collectionId: randomUUID(),
    role: "owner",
    mimeType: "video/webm",
    originalName: "other.webm",
    bytes: 10,
    createdAt: c.createdAt,
  });
  assert.equal(
    (
      await act(c, {
        action: "attach_segment",
        sessionId,
        segment: { ...segments[0], id: randomUUID(), mediaId: foreign },
      })
    ).status,
    400,
  );
});

test("guided mode is explicit and rejects missing themes or invented precise timing", async () => {
  const c = await make();
  const sessionId = await start(c, "guided");
  assert.equal(
    (await act(c, { action: "start", sessionId, provider: "guided" })).status,
    200,
  );
  assert.equal(
    (await act(c, { action: "start", sessionId, provider: "elevenlabs" }))
      .status,
    409,
  );
  assert.equal(
    (
      await act(c, {
        action: "append_turns",
        sessionId,
        turns: [{ ...turn(0, "Words"), chapterId: undefined }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await act(c, {
        action: "append_turns",
        sessionId,
        turns: [{ ...turn(0, "Words"), timing: "verified" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await act(c, {
        action: "append_turns",
        sessionId,
        turns: [{ ...turn(0, "Words"), text: "a".repeat(30001) }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await store.getCollection(c.id)).interviews[0].provider,
    "guided",
  );
});

test("live source export preserves originals and refuses an automatic video plan from estimated timing", async () => {
  const c = await make();
  const sessionId = await start(c);
  const media = await import("../src/lib/collection/media");
  const sourceBytes = new Uint8Array([1, 7, 9, 12]);
  const original = await media.saveLocalMedia(
    c.id,
    "owner",
    new File([sourceBytes], "synthetic.webm", { type: "video/webm" }),
  );
  assert.equal(
    (
      await act(c, {
        action: "attach_segment",
        sessionId,
        segment: {
          id: randomUUID(),
          mediaId: original.id,
          startMs: 0,
          durationMs: 10_000,
          kind: "video",
        },
      })
    ).status,
    200,
  );
  const turns = [1, 2, 3, 4].map((n) => ({
    ...turn(n, `Specific memory ${n}.`, `q${n}`),
    startMs: n * 1000,
    endMs: n * 1000 + 500,
    timing: "estimated",
  }));
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns })).status,
    200,
  );
  await store.mutateCollection(c.id, async (current: Collection) => ({
    ...current,
    chapters: await content.draftChapters(current),
  }));
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "time-tapestry-source-export-"),
  );
  const workspace = path.join(parent, "edit-packet");
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      "--import",
      "tsx",
      "scripts/export-collection-video.ts",
      "export",
      "--collection",
      c.id,
      "--work-dir",
      workspace,
    ]),
    (error: any) => {
      assert.match(
        error.stderr,
        /Live conversation timing needs editorial alignment/,
      );
      return true;
    },
  );
  const packet = JSON.parse(
    await readFile(
      path.join(workspace, "conversation-source-ranges.json"),
      "utf8",
    ),
  );
  assert.equal(packet.status, "needs-editor-alignment");
  assert.equal(packet.originals.length, 1);
  assert.equal(packet.answers.length, 4);
  assert.equal(packet.answers[0].timing, "estimated");
  assert.deepEqual(
    new Uint8Array(
      await readFile(path.join(workspace, packet.originals[0].relativePath)),
    ),
    sourceBytes,
  );
  assert.deepEqual(await readdir(path.join(workspace, "plans")), []);
});

test("a next-day resumed segment uses the original wall-clock timeline without clipping its offsets", async () => {
  const c = await make();
  const sessionId = await start(c);
  await act(c, { action: "set_status", sessionId, status: "paused" });
  assert.equal(
    (await act(c, { action: "set_status", sessionId, status: "active" }))
      .status,
    200,
  );
  const media = await import("../src/lib/collection/media");
  const original = await media.saveLocalMedia(
    c.id,
    "owner",
    new File([new Uint8Array([1, 2])], "resumed.webm", { type: "audio/webm" }),
  );
  const nextDay = 24 * 60 * 60 * 1000;
  const segment = {
    id: randomUUID(),
    mediaId: original.id,
    startMs: nextDay,
    durationMs: 60_000,
    kind: "voice",
  };
  assert.equal(
    (await act(c, { action: "attach_segment", sessionId, segment })).status,
    200,
  );
  const resumedTurn = {
    ...turn(0, "I remembered another detail the next day."),
    startMs: nextDay + 10_000,
    endMs: nextDay + 20_000,
    timing: "estimated",
  };
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns: [resumedTurn] }))
      .status,
    200,
  );
  const current = await store.getCollection(c.id);
  assert.equal(current.interviews[0].segments[0].startMs, nextDay);
  assert.equal(current.interviews[0].turns[0].startMs, nextDay + 10_000);
  assert.deepEqual(
    interviewAnswers(current, "q1")[0].liveSource!.sourceRanges.map(
      ({ inMs, outMs }) => [inMs, outMs],
    ),
    [[10_000, 20_000]],
  );
  for (const invalid of [
    { ...segment, id: randomUUID(), durationMs: 0 },
    { ...segment, id: randomUUID(), durationMs: 2 * 60 * 60 * 1000 + 1 },
    { ...segment, id: randomUUID(), startMs: Number.MAX_SAFE_INTEGER + 1 },
    { ...segment, id: randomUUID(), startMs: nextDay + 0.5 },
  ])
    assert.equal(
      (await act(c, { action: "attach_segment", sessionId, segment: invalid }))
        .status,
      400,
    );
  assert.equal(
    (await store.getCollection(c.id)).interviews[0].segments.length,
    1,
  );
});

test("only explicit inclusion restores a corrected original and it does not silently replace the correction", async () => {
  const c = await make();
  const sessionId = await start(c);
  const first = turn(0, "Original version.");
  const correction = {
    ...turn(1, "Corrected version."),
    supersedesTurnId: first.id,
  };
  await act(c, {
    action: "append_turns",
    sessionId,
    turns: [first, correction],
  });
  await act(c, {
    action: "append_turns",
    sessionId,
    turns: [first, correction],
  });
  assert.deepEqual(
    interviewAnswers(await store.getCollection(c.id), "q1").map(
      (item) => item.text,
    ),
    [correction.text],
  );
  assert.equal(
    (
      await act(c, {
        action: "select_turn",
        sessionId,
        turnId: first.id,
        included: true,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    interviewAnswers(await store.getCollection(c.id), "q1").map(
      (item) => item.text,
    ),
    [first.text, correction.text],
  );
});

test("provider reconnects keep one archive timeline and append idempotent connection history", async () => {
  const c = await make();
  const sessionId = await start(c);
  const originalId = `conv_${randomUUID()}`;
  const resumedId = `conv_${randomUUID()}`;
  const first = {
    action: "set_status",
    sessionId,
    status: "active",
    providerConversationId: originalId,
  };
  assert.equal((await act(c, first)).status, 200);
  const before = await store.getCollection(c.id);
  const startedAt = before.interviews[0].startedAt;
  const originalTurn = turn(0, "A memory from before the pause.");
  await act(c, { action: "append_turns", sessionId, turns: [originalTurn] });
  assert.equal(
    (await act(c, { action: "set_status", sessionId, status: "paused" }))
      .status,
    200,
  );
  const resumed = { ...first, providerConversationId: resumedId };
  assert.equal((await act(c, resumed)).status, 200);
  assert.equal((await act(c, resumed)).status, 200);
  const after = await store.getCollection(c.id);
  assert.equal(after.interviews.length, 1);
  assert.equal(after.interviews[0].startedAt, startedAt);
  assert.equal(after.interviews[0].providerConversationId, resumedId);
  assert.deepEqual(after.interviews[0].providerConversationIds, [
    originalId,
    resumedId,
  ]);
  assert.equal(after.interviews[0].turns[0].text, originalTurn.text);
  await store.mutateCollection(c.id, (current: Collection) => {
    delete current.interviews![0].providerConversationIds;
    current.interviews![0].providerConversationId = originalId;
    return current;
  });
  assert.equal((await act(c, resumed)).status, 200);
  assert.deepEqual(
    (await store.getCollection(c.id)).interviews[0].providerConversationIds,
    [originalId, resumedId],
  );
});

test("transcripts recover before recordings but cannot complete or generate without them", async () => {
  const c = await make();
  const sessionId = await start(c, "guided");
  const turns = [1, 2, 3, 4].map((i) =>
    turn(i, `Recorded memory ${i}.`, `q${i}`),
  );
  assert.equal(
    (await act(c, { action: "append_turns", sessionId, turns })).status,
    200,
  );
  assert.equal(
    (await act(c, { action: "set_status", sessionId, status: "completed" }))
      .status,
    400,
  );
  assert.equal(
    (await store.getCollection(c.id)).interviews[0].status,
    "active",
  );
  const generate = () =>
    legacyPost(
      request(`/api/collection/${c.id}?key=${c.ownerKey}`, {
        action: "generate",
      }),
      params(c.id),
    );
  assert.equal((await generate()).status, 400);
  assert.equal((await store.getCollection(c.id)).chapters.length, 0);
  const mediaId = randomUUID();
  const media = {
    id: mediaId,
    collectionId: c.id,
    role: "owner",
    mimeType: "audio/webm",
    originalName: "synthetic.webm",
    bytes: 10,
    createdAt: c.createdAt,
    localPath: path.join(store.dataRoot, "media", mediaId),
  };
  const segment = {
    id: randomUUID(),
    mediaId,
    kind: "voice",
    startMs: 0,
    durationMs: 10_000,
  };
  for (const change of [
    { bytes: 0, localPath: undefined },
    { localPath: undefined },
    { collectionId: randomUUID() },
    { role: "recipient" },
    { mimeType: "video/webm" },
  ]) {
    await store.putMedia({ ...media, ...change });
    assert.equal(
      (await act(c, { action: "attach_segment", sessionId, segment })).status,
      400,
    );
  }
  assert.equal(
    (await store.getCollection(c.id)).interviews[0].segments.length,
    0,
  );
  await store.putMedia(media);
  assert.equal(
    (await act(c, { action: "attach_segment", sessionId, segment })).status,
    200,
  );
  await store.putMedia({ ...media, bytes: 0 });
  assert.equal(
    (await act(c, { action: "set_status", sessionId, status: "completed" }))
      .status,
    400,
  );
  await store.putMedia(media);
  assert.equal(
    (await act(c, { action: "set_status", sessionId, status: "completed" }))
      .status,
    200,
  );
  assert.equal((await generate()).status, 200);
  const saved = await store.getCollection(c.id);
  assert.equal(saved.interviews[0].turns.length, 4);
  assert.equal(saved.chapters.length, 4);
});
