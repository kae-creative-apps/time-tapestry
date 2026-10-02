import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
let create: any, post: any, get: any, store: any;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, body?: unknown) =>
  new NextRequest(
    `http://localhost${url}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
before(async () => {
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
    request(`/api/collection/${c.id}?key=${key}`, body),
    params(c.id),
  );
  return { status: r.status, body: await r.json() };
}
async function ready(c: any) {
  for (let i = 1; i <= 4; i++) {
    const r = await act(c, {
      action: "save_take",
      take: {
        id: randomUUID(),
        questionId: `q${i}`,
        kind: "text",
        prompt: `Q${i}`,
        text: `A specific memory for chapter ${i}. I learned to listen and offer help.`,
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(r.status, 200);
  }
  assert.equal((await act(c, { action: "generate" })).status, 200);
  const current = await store.getCollection(c.id);
  for (const ch of current.chapters)
    assert.equal(
      (
        await act(c, {
          action: "edit_chapter",
          chapterId: ch.id,
          title: ch.title,
          content: ch.content,
          postcardNote: ch.postcardNote,
          editorialReviewed: true,
          blessing: {
            encouragement: "Take time to listen.",
            scriptureReference: "",
            scriptureText: "",
            scriptureTranslation: "",
          },
        })
      ).status,
      200,
    );
  return store.getCollection(c.id);
}
test("address link cannot expose drafts or owner/private dispatch payloads", async () => {
  const c = await make();
  await act(c, {
    action: "blessing",
    questionId: "q1",
    value: { encouragement: "Private draft" },
  });
  const r = await get(
    request(`/api/collection/${c.id}?key=${c.recipientKey}`),
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
test("selected transcript change invalidates the previous approved draft", async () => {
  const c = await ready(await make());
  const take = c.takes[0];
  await act(c, {
    action: "save_take",
    take: { ...take, text: "Corrected memory" },
  });
  const changed = await store.getCollection(c.id);
  assert.equal(changed.draftOutdated, true);
  assert.ok(changed.chapters.every((ch: any) => !ch.editorialReviewed));
  assert.equal((await act(c, { action: "approve" })).status, 400);
});
test("returning to interview does not regenerate or erase edited chapters", async () => {
  const c = await ready(await make());
  await act(c, {
    action: "edit_chapter",
    chapterId: "q1",
    title: "My revised title",
    content: "My carefully edited story.",
    postcardNote: "A personal introduction.",
    editorialReviewed: true,
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
test("explicit take selection survives rerecording and transcript correction", async () => {
  const c = await make();
  const one = {
    id: randomUUID(),
    questionId: "q1",
    kind: "text",
    prompt: "Q",
    text: "First",
  };
  const two = { ...one, id: randomUUID(), text: "Second" };
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
    take: { ...two, id: randomUUID(), text: "Third" },
  });
  result = await store.getCollection(c.id);
  assert.equal(result.selectedTakeIds.q1, one.id);
});
test("approval freezes four packages and queues no recipient spoiler email", async () => {
  const c = await ready(await make());
  const approved = await act(c, { action: "approve" });
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
  await act(c, { action: "approve" });
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
      kind: "text",
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
