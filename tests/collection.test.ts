import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { verifiedRecipientCookie } from "./verified-recipient-fixture";
import {
  attachSyntheticOriginalFilms,
  recordedApproval,
} from "./recorded-review-fixture";
let create: any, post: any, get: any, store: any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, body?: unknown, cookie?: string) =>
  new NextRequest(
    `http://localhost${url}`,
    body === undefined
      ? { headers: cookie ? { cookie } : {} }
      : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify(body),
        },
  );
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
  });
  for (const key of [
    "GLOO_API_KEY",
    "OPENAI_API_KEY",
    "ELEVENLABS_API_KEY",
    "RESEND_API_KEY",
    "LOB_API_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
  ])
    delete process.env[key];
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "time-tapestry-tests-"),
  );
  create = (await import("../src/app/api/collection/route")).POST;
  const routes = await import("../src/app/api/collection/[id]/route");
  post = routes.POST;
  get = routes.GET;
  store = await import("../src/lib/collection/store");
});
async function make() {
  const r = await create(
    request("/api/collection", {
      initiationPath: "share",
      storyteller: {
        name: "Demo Storyteller",
        email: "storyteller@example.com",
      },
      recipient: { name: "Demo Recipient", email: "recipient@example.com" },
      address: {
        line1: "123 Example Lane",
        city: "Example",
        region: "CO",
        postalCode: "80000",
        country: "US",
      },
    }),
  );
  assert.equal(r.status, 201);
  const b = await r.json();
  return await store.getCollection(b.collection.id);
}
async function act(c: any, body: unknown, key = c.ownerKey) {
  const r = await post(
    request(
      `/api/collection/${c.id}?key=${key}`,
      body,
      key === c.recipientKey
        ? await verifiedRecipientCookie(c.recipient.email)
        : undefined,
    ),
    params(c.id),
  );
  return { status: r.status, body: await r.json() };
}
async function recording(c: any, kind = "voice", text?: string) {
  const id = randomUUID();
  await store.putMedia({
    id,
    collectionId: c.id,
    role: "owner",
    mimeType: kind === "voice" ? "audio/webm" : "video/webm",
    originalName: "synthetic.webm",
    ...(text
      ? {
          transcription: {
            text,
            provider: "openai",
            model: "whisper-1",
            completedAt: c.createdAt,
          },
        }
      : {}),
    bytes: 10,
    createdAt: c.createdAt,
    localPath: path.join(store.dataRoot, "media", id),
  });
  return id;
}
async function ready(c: any) {
  for (let i = 1; i <= 4; i++) {
    const text = `A specific memory for chapter ${i}. I learned to listen and offer help.`;
    const r = await act(c, {
      action: "save_take",
      take: {
        id: randomUUID(),
        questionId: `q${i}`,
        kind: "voice",
        mediaId: await recording(c, "voice", text),
        prompt: `Q${i}`,
        text,
      },
    });
    assert.equal(r.status, 200);
  }
  assert.equal((await act(c, { action: "generate" })).status, 200);
  return attachSyntheticOriginalFilms(await store.getCollection(c.id));
}
test("address link cannot expose drafts or owner/private dispatch payloads", async () => {
  const c = await make();
  await act(c, {
    action: "blessing",
    questionId: "q1",
    value: { encouragement: "Private draft" },
  });
  const r = await get(
    request(
      `/api/collection/${c.id}?key=${c.recipientKey}`,
      undefined,
      await verifiedRecipientCookie(c.recipient.email),
    ),
    params(c.id),
  );
  const b = await r.json();
  assert.deepEqual(b.collection.chapterBlessings, {});
  assert.deepEqual(b.collection.takes, []);
  assert.equal(b.collection.ownerKey, undefined);
  assert.equal(b.collection.links, undefined);
  assert.equal(
    (await get(request(`/api/collection/${c.id}?key=wrong`), params(c.id)))
      .status,
    404,
  );
});
test("client transcript edits are rejected without changing the saved draft", async () => {
  const c = await ready(await make());
  const rejected = await act(c, {
    action: "save_take",
    take: { ...c.takes[0], text: "Corrected memory" },
  });
  assert.equal(rejected.status, 400);
  const unchanged = await store.getCollection(c.id);
  assert.equal(unchanged.draftOutdated, false);
  assert.deepEqual(unchanged.chapters, c.chapters);
  assert.deepEqual(unchanged.takes, c.takes);
});
test("returning to interview does not regenerate or erase edited chapters", async () => {
  const c = await ready(await make());
  assert.equal(
    (
      await act(c, {
        action: "edit_chapter",
        chapterId: "q1",
        content: "New client words",
      })
    ).status,
    410,
  );
  // A historical edited draft remains readable and is archived on regeneration.
  await store.mutateCollection(c.id, (current: any) => {
    current.chapters[0].content = "My carefully edited story.";
    return current;
  });
  await act(c, { action: "generate" });
  let result = await store.getCollection(c.id);
  assert.equal(result.chapters[0].content, "My carefully edited story.");
  await act(c, { action: "generate", regenerate: true });
  result = await store.getCollection(c.id);
  assert.equal(result.draftHistory.length, 1);
  assert.equal(
    result.draftHistory[0].chapters[0].content,
    "My carefully edited story.",
  );
  assert.equal(result.chapters[0].editorialReviewed, false);
});
test("explicit take selection survives rerecording and rejected transcript edits", async () => {
  const c = await make();
  const one = {
    id: randomUUID(),
    questionId: "q1",
    kind: "voice",
    mediaId: await recording(c, "voice", "First"),
    prompt: "Q",
    text: "First",
  };
  const two = {
    ...one,
    id: randomUUID(),
    mediaId: await recording(c, "voice", "Second"),
    text: "Second",
  };
  await act(c, { action: "save_take", take: one });
  await act(c, { action: "save_take", take: two });
  await act(c, {
    action: "save_take",
    take: { ...one, text: "First corrected" },
  });
  let result = await store.getCollection(c.id);
  assert.equal(result.selectedTakeIds.q1, two.id);
  await act(c, { action: "select_take", questionId: "q1", takeId: one.id });
  await act(c, {
    action: "save_take",
    take: {
      ...two,
      id: randomUUID(),
      mediaId: await recording(c, "voice", "Third"),
      text: "Third",
    },
  });
  result = await store.getCollection(c.id);
  assert.equal(result.selectedTakeIds.q1, one.id);
});
test("approval freezes four packages and queues no recipient spoiler email", async () => {
  const c = await ready(await make());
  const approved = await act(c, { action: "approve", ...recordedApproval(c) });
  assert.equal(approved.status, 200);
  const result = await store.getCollection(c.id);
  assert.equal(result.deliveries.length, 4);
  assert.equal(result.status, "approved");
  assert.ok(result.notifications.every((n: any) => n.to !== c.recipient.email));
  assert.equal(
    (
      await act(c, {
        action: "blessing",
        questionId: "q1",
        value: { encouragement: "Changed" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await act(c, { action: "save_take", take: c.takes[0] })).status,
    400,
  );
});
test("recipient reply is explicit, idempotent and cannot be sent by requester", async () => {
  const c = await ready(await make());
  await act(c, { action: "approve", ...recordedApproval(c) });
  const reply = {
    action: "reply",
    chapterId: "q1",
    text: "Thank you for telling me this story.",
    replyId: randomUUID(),
  };
  assert.equal((await act(c, reply, c.requesterKey)).status, 400);
  assert.equal((await act(c, reply, c.recipientKey)).status, 200);
  assert.equal((await act(c, reply, c.recipientKey)).status, 200);
  const result = await store.getCollection(c.id);
  assert.equal(result.replies.length, 1);
  assert.equal(
    result.notifications.filter((n: any) => n.kind === "reply_received").length,
    1,
  );
});
test("followups have a server-enforced maximum of two", async () => {
  const c = await make();
  await act(c, {
    action: "save_take",
    take: {
      id: randomUUID(),
      questionId: "q1",
      kind: "voice",
      mediaId: await recording(c, "voice", "A memory"),
      prompt: "Q",
      text: "A memory",
    },
  });
  for (let i = 0; i < 4; i++)
    await act(c, { action: "followup", questionId: "q1" });
  assert.equal((await store.getCollection(c.id)).followUps.q1.length, 2);
});
test("a dead local process lock is recovered without discarding saved data", async () => {
  const c = await make();
  await writeFile(
    path.join(store.dataRoot, `${c.id}.lock`),
    JSON.stringify({ pid: 999999999, createdAt: Date.now() - 1000 }),
  );
  const r = await act(c, { action: "progress", currentQuestion: 2 });
  assert.equal(r.status, 200);
  assert.equal((await store.getCollection(c.id)).currentQuestion, 2);
});

test("digital approval works without a postal address and postal scheduling is explicit", async () => {
  const c = await ready(await make());
  await store.mutateCollection(c.id, (current: any) => ({
    ...current,
    address: undefined,
    addressConfirmed: false,
  }));
  const result = await act(c, {
    action: "approve",
    deliveryMode: "digital",
    ...recordedApproval(c),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.collection.status, "approved");
  assert.equal(result.body.collection.deliveries.length, 0);
  assert.equal(
    result.body.collection.notifications.filter(
      (n: any) => n.kind === "collection_ready",
    ).length,
    1,
  );
  const postal = await act(c, { action: "schedule_postcards" });
  assert.equal(postal.status, 400);
  assert.match(postal.body.error, /address/i);
});

test("historical AI films remain readable but cannot authorize a new recorded collection", async () => {
  const c = await ready(await make());
  const originalMediaId = c.chapters[0].videoMediaId;
  await store.mutateCollection(c.id, (current: any) => {
    current.chapters[0].film.narrationKind = "ai_interviewer";
    return current;
  });
  const read = await get(
    request(`/api/collection/${c.id}?key=${c.ownerKey}`),
    params(c.id),
  );
  assert.equal(read.status, 200);
  assert.equal(
    (await read.json()).collection.chapters[0].videoMediaId,
    originalMediaId,
  );
  assert.equal(
    (
      await act(c, {
        action: "edit_chapter",
        chapterId: "q1",
        content: "Edited",
      })
    ).status,
    410,
  );
  assert.equal(
    (await act(c, { action: "approve", ...recordedApproval(c) })).status,
    400,
  );
  assert.ok(await store.getMedia(originalMediaId));
});

test("new answers require completed owner recordings and server-owned transcripts", async () => {
  const c = await make();
  const take = {
    id: randomUUID(),
    questionId: "q1",
    prompt: "Tell me about a memory.",
    kind: "voice",
    text: "Words from my recording.",
  };
  for (const kind of ["text", "voice", "video"]) {
    const rejected = await act(c, {
      action: "save_take",
      take: { ...take, kind },
    });
    assert.equal(rejected.status, 400, kind);
  }
  const validId = await recording(c);
  const valid = await store.getMedia(validId);
  for (const change of [
    { bytes: 0, localPath: undefined },
    { bytes: 0 },
    { localPath: undefined },
    { role: "recipient" },
    { collectionId: randomUUID() },
    { mimeType: "video/webm" },
  ]) {
    const mediaId = randomUUID();
    await store.putMedia({ ...valid, ...change, id: mediaId });
    assert.equal(
      (await act(c, { action: "save_take", take: { ...take, mediaId } }))
        .status,
      400,
    );
  }
  assert.equal((await store.getCollection(c.id)).takes.length, 0);
  const recorded = {
    ...take,
    mediaId: validId,
    text: "",
    transcriptionStatus: "pending",
  };
  assert.equal(
    (await act(c, { action: "save_take", take: recorded })).status,
    200,
  );
  assert.equal(
    (
      await act(c, {
        action: "save_take",
        take: {
          ...recorded,
          text: "A corrected transcript.",
          transcriptionStatus: "ready",
        },
      })
    ).status,
    400,
  );
  const saved = await store.getCollection(c.id);
  assert.equal(saved.takes.length, 1);
  assert.equal(saved.takes[0].text, "");
  assert.equal(saved.takes[0].mediaId, validId);
  const videoId = await recording(c, "video", take.text);
  assert.equal(
    (
      await act(c, {
        action: "save_take",
        take: { ...take, id: randomUUID(), kind: "video", mediaId: videoId },
      })
    ).status,
    200,
  );
});

test("drafting cannot use typed answers or unfinished media from saved metadata", async () => {
  const c = await ready(await make());
  const before = await store.getCollection(c.id);
  const firstMediaId = before.takes[0].mediaId;
  const media = await store.getMedia(firstMediaId);
  await store.putMedia({ ...media, bytes: 0, localPath: undefined });
  const rejected = await act(c, { action: "generate", regenerate: true });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /original recording/);
  assert.deepEqual((await store.getCollection(c.id)).chapters, before.chapters);
  // Opening a previously saved draft remains possible without regeneration.
  assert.equal((await act(c, { action: "generate" })).status, 200);
  await store.putMedia(media);
  await store.mutateCollection(c.id, (current: any) => {
    const historical = {
      ...current.takes[0],
      id: randomUUID(),
      questionId: "q1-f1",
      kind: "text",
      mediaId: undefined,
      text: "A historical typed answer.",
    };
    current.takes.push(historical);
    current.selectedTakeIds[historical.questionId] = historical.id;
    return current;
  });
  assert.equal(
    (await act(c, { action: "generate", regenerate: true })).status,
    400,
  );
  const read = await get(
    request(`/api/collection/${c.id}?key=${c.ownerKey}`),
    params(c.id),
  );
  assert.equal(read.status, 200);
  assert.equal(
    (await read.json()).collection.takes.at(-1).text,
    "A historical typed answer.",
  );
});
