import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Collection } from "../src/lib/collection/types";

let directory: string;
let store: typeof import("../src/lib/collection/store");
let requestGuard: typeof import("../src/lib/security/request");
let create: typeof import("../src/lib/collection/create");
let counterKey: string;

before(async () => {
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "SECURITY_TEST_BYPASS",
    "ELEVENLABS_AGENT_ID",
  ])
    delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    ELEVENLABS_API_KEY: "synthetic-provider-key",
    GLOO_API_KEY: "synthetic-provider-key",
    OPENAI_API_KEY: "synthetic-provider-key",
    SECURITY_PROVIDER_DAILY_LIMIT: "2",
  });
  directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-provider-budget-"),
  );
  process.env.COLLECTION_DATA_DIR = directory;
  store = await import("../src/lib/collection/store");
  requestGuard = await import("../src/lib/security/request");
  create = await import("../src/lib/collection/create");
  const { opaqueIdentifier } = await import("../src/lib/security/rate-limit");
  counterKey = `guard-${opaqueIdentifier("all-provider-actions:daily")}`;
});
beforeEach(async () => {
  await store.writeRecord(counterKey, {
    recordType: "rate-limit",
    startedAt: Date.now(),
    count: 0,
  });
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function spent() {
  return (await store.readRecord<{ count: number }>(counterKey))!.count;
}
async function fixture(withAnswers = false) {
  const c = create.prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Synthetic storyteller", email: "story@example.test" },
    recipient: { name: "Synthetic recipient", email: "recipient@example.test" },
  });
  if (withAnswers)
    for (const questionId of ["q1", "q2", "q3", "q4"]) {
      const id = `${questionId}-synthetic-answer`;
      c.takes.push({
        id,
        questionId,
        prompt: "A fixture question",
        kind: "voice",
        mediaId: `${c.id}-${questionId}-recording`,
        text: "A synthetic answer for a test.",
        createdAt: c.createdAt,
      });
      await store.putMedia({
        id: `${c.id}-${questionId}-recording`,
        collectionId: c.id,
        role: "owner",
        provenance: "uploaded_recording",
        mimeType: "audio/webm",
        originalName: "synthetic-recording.webm",
        bytes: 100,
        url: "https://recording.example.test/synthetic.webm",
        createdAt: c.createdAt,
      });
      c.selectedTakeIds[questionId] = id;
    }
  await store.putCollection(c);
  return c;
}
function req(c: Collection, endpoint: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/collection/${c.id}${endpoint}?key=${c.ownerKey}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}
const context = (c: Collection) => ({ params: Promise.resolve({ id: c.id }) });

test("invalid owner payloads and unavailable sessions do not spend the shared provider allowance", async (t) => {
  let network = 0;
  t.mock.method(globalThis, "fetch", async () => {
    network++;
    throw new Error("No provider request is expected");
  });
  const c = await fixture();
  const speak = await import("../src/app/api/collection/[id]/speak/route");
  for (const text of [12, "", "   ", "x".repeat(1201)])
    assert.equal(
      (await speak.POST(req(c, "/speak", { text }), context(c))).status,
      400,
    );
  const transcribe =
    await import("../src/app/api/collection/[id]/transcribe/route");
  assert.equal(
    (
      await transcribe.POST(
        req(c, "/transcribe", { mediaId: "missing-media" }),
        context(c),
      )
    ).status,
    400,
  );
  const session =
    await import("../src/app/api/collection/[id]/conversation/session/route");
  assert.equal(
    (
      await session.POST(
        req(c, "/conversation/session", { sessionId: "bad" }),
        context(c),
      )
    ).status,
    400,
  );
  assert.equal(
    (await session.POST(req(c, "/conversation/session", {}), context(c)))
      .status,
    503,
  );
  const collection = await import("../src/app/api/collection/[id]/route");
  assert.equal(
    (await collection.POST(req(c, "", { action: "generate" }), context(c)))
      .status,
    400,
  );
  assert.equal(
    (
      await collection.POST(
        req(c, "", { action: "followup", questionId: "bad" }),
        context(c),
      )
    ).status,
    400,
  );
  assert.equal(await spent(), 0);
  assert.equal(network, 0);
});

test("valid speech reserves before calling the provider and exhausted budget prevents another call", async (t) => {
  const { elevenlabs } = await import("../src/lib/elevenlabs-client");
  process.env.ELEVENLABS_AGENT_ID = "synthetic-interviewer";
  t.after(() => delete process.env.ELEVENLABS_AGENT_ID);
  t.mock.method(elevenlabs!.conversationalAi.agents, "get", async () => ({
    conversationConfig: {
      tts: {
        voiceId: "synthetic-interviewer-voice",
        stability: 0.5,
        similarityBoost: 0.75,
        speed: 1,
      },
    },
  }));
  let calls = 0;
  t.mock.method(elevenlabs!.textToSpeech, "stream", async () => {
    calls++;
    assert.equal(await spent(), calls);
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  });
  const { POST } = await import("../src/app/api/collection/[id]/speak/route");
  const c = await fixture();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await POST(
          req(c, "/speak", { text: "A synthetic question?" }),
          context(c),
        )
      ).status,
      200,
    );
  const blocked = await POST(
    req(c, "/speak", { text: "Another synthetic question?" }),
    context(c),
  );
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("retry-after"));
  assert.equal(calls, 2);
});

test("reservation is one-shot per guarded action and concurrent owners cannot exceed the shared limit", async () => {
  const guards = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      requestGuard.guardRequest(new NextRequest("http://localhost/"), {
        action: "speak",
        resourceId: `owner-${index}`,
      }),
    ),
  );
  const results = await Promise.allSettled(
    guards.map(async (guard) => {
      await Promise.all([
        guard.reserveProviderBudget(),
        guard.reserveProviderBudget(),
      ]);
    }),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    2,
  );
  assert.equal(
    await spent(),
    6,
    "Each action reserves at most once, even when denied",
  );
});

test("generation validates all four chapters before any paid edit and charges one valid batch", async (t) => {
  const { gloo } = await import("../src/lib/gloo-client");
  let calls = 0;
  t.mock.method(
    gloo!.chat.completions,
    "create",
    async (body: { messages: Array<{ role: string; content?: unknown }> }) => {
      calls++;
      assert.equal(await spent(), 1);
      const input = body.messages.find(
        (message) => message.role === "user",
      )?.content;
      assert.ok(typeof input === "string");
      const { answers } = JSON.parse(input) as {
        answers: Array<{ id: string; text: string }>;
      };
      return {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                paragraphs: answers.map((answer) => ({
                  text: answer.text,
                  sourceIds: [answer.id],
                })),
                postcardNote: "Synthetic note.",
                postcardSourceIds: answers.map((answer) => answer.id),
              }),
            },
          },
        ],
      };
    },
  );
  const { POST } = await import("../src/app/api/collection/[id]/route");
  const c = await fixture(true);
  const incomplete = {
    ...c,
    selectedTakeIds: { ...c.selectedTakeIds, q4: "missing" },
  };
  await store.putCollection(incomplete);
  assert.equal(
    (await POST(req(c, "", { action: "generate" }), context(c))).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(await spent(), 0);
  await store.putCollection(c);
  assert.equal(
    (await POST(req(c, "", { action: "generate" }), context(c))).status,
    200,
  );
  assert.equal(calls, 4);
  assert.equal(await spent(), 1);
  assert.equal(
    (await POST(req(c, "", { action: "generate" }), context(c))).status,
    200,
  );
  assert.equal(calls, 4, "Reopening an existing draft does not regenerate it");
  assert.equal(await spent(), 1);
});

test("source-only generation and exhausted follow-ups do not spend provider allowance", async () => {
  const { POST } = await import("../src/app/api/collection/[id]/route");
  const c = await fixture(true);
  c.followUps.q1 = ["First follow-up", "Second follow-up"];
  await store.putCollection(c);
  assert.equal(
    (
      await POST(
        req(c, "", { action: "followup", questionId: "q1" }),
        context(c),
      )
    ).status,
    200,
  );
  delete process.env.GLOO_API_KEY;
  try {
    assert.equal(
      (await POST(req(c, "", { action: "generate" }), context(c))).status,
      200,
    );
    assert.equal(await spent(), 0);
  } finally {
    process.env.GLOO_API_KEY = "synthetic-provider-key";
  }
});

test("film providers skip unconfigured work and honor the shared budget before contacting providers", async (t) => {
  const { narrateFilmChunk } =
    await import("../src/lib/collection/films/provider");
  const { transcribeOriginal } =
    await import("../src/lib/collection/films/transcription");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("No provider call is allowed");
  });
  const voice = {
    agentId: "synthetic-agent",
    voiceId: "synthetic-voice",
    modelId: "eleven_multilingual_v2",
    settings: {
      stability: 0.5,
      similarityBoost: 0.8,
      speed: 1,
      style: 0,
      useSpeakerBoost: true,
    },
  };
  delete process.env.ELEVENLABS_API_KEY;
  try {
    await assert.rejects(
      narrateFilmChunk(voice, "Synthetic test text."),
      /not configured/,
    );
    await assert.rejects(
      transcribeOriginal("unused-fixture", "fixture", 1000),
      /needs ElevenLabs/,
    );
    assert.equal(await spent(), 0);
  } finally {
    process.env.ELEVENLABS_API_KEY = "synthetic-provider-key";
  }
  await requestGuard.reserveProviderBudget("render_film");
  await requestGuard.reserveProviderBudget("render_film");
  for (const work of [
    () => narrateFilmChunk(voice, "Synthetic test text."),
    () => transcribeOriginal("unused-fixture", "fixture", 1000),
  ])
    await assert.rejects(
      work(),
      (error: unknown) =>
        error instanceof Error && "status" in error && error.status === 429,
    );
  assert.equal(calls, 0);
});
