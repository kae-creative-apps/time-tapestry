import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

let directory: string;
let voice: typeof import("../src/lib/elevenlabs-client");
let film: typeof import("../src/lib/collection/films/provider");
const tts = {
  voiceId: "synthetic-configured-interviewer",
  modelId: "eleven_v4_turbo",
  expressiveMode: true,
  stability: 0.34,
  similarityBoost: 0.63,
  speed: 0.91,
};
const expectedSettings = {
  stability: tts.stability,
  similarityBoost: tts.similarityBoost,
  speed: tts.speed,
  style: 0,
  useSpeakerBoost: true,
};

before(async () => {
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "STORY_FILM_TTS_MODEL",
  ])
    delete process.env[key];
  directory = await mkdtemp(
    path.join(os.tmpdir(), "tapestry-interviewer-voice-"),
  );
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    COLLECTION_DATA_DIR: directory,
    ELEVENLABS_API_KEY: "synthetic-key-never-sent",
    ELEVENLABS_AGENT_ID: "synthetic-agent",
    ELEVENLABS_VOICE_ID: "unrelated-voice-must-not-be-used",
    ELEVENLABS_MODEL: "unrelated-model-must-not-be-used",
  });
  voice = await import("../src/lib/elevenlabs-client");
  film = await import("../src/lib/collection/films/provider");
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("read-aloud and films share the verified interviewer voice and settings, ignoring generic voice overrides", async (t) => {
  const events: string[] = [];
  t.mock.method(
    voice.elevenlabs!.conversationalAi.agents,
    "get",
    async (agentId: string) => {
      assert.equal(agentId, "synthetic-agent");
      events.push("verify");
      return { conversationConfig: { tts } };
    },
  );
  t.mock.method(
    voice.elevenlabs!.textToSpeech,
    "stream",
    async (voiceId: string, options: Record<string, unknown>) => {
      events.push("speak");
      assert.equal(voiceId, tts.voiceId);
      assert.equal(options.modelId, "eleven_multilingual_v2");
      assert.deepEqual(options.voiceSettings, expectedSettings);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    },
  );
  const resolved = await film.resolveFilmVoice();
  assert.deepEqual(resolved, {
    agentId: "synthetic-agent",
    voiceId: tts.voiceId,
    modelId: "eleven_multilingual_v2",
    settings: expectedSettings,
  });
  events.length = 0;
  await voice.streamTextToSpeech("A synthetic question.", async () => {
    events.push("reserve");
  });
  assert.deepEqual(events, ["verify", "reserve", "speak"]);
});

test("speech removes performance cues while preserving bracketed memories and the configured voice", async (t) => {
  const events: string[] = [];
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    events.push("verify");
    return { conversationConfig: { tts } };
  });
  t.mock.method(
    voice.elevenlabs!.textToSpeech,
    "stream",
    async (voiceId: string, options: Record<string, unknown>) => {
      events.push("speak");
      assert.equal(voiceId, tts.voiceId);
      assert.equal(options.modelId, "eleven_multilingual_v2");
      assert.deepEqual(options.voiceSettings, expectedSettings);
      assert.equal(
        options.text,
        "You mentioned [June 1956] (not 1957). What made that day feel different?",
      );
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    },
  );
  await voice.streamTextToSpeech(
    "[smile] You mentioned [June 1956] (not 1957). *gently* What made that day feel different?",
    async () => {
      events.push("reserve");
    },
  );
  assert.deepEqual(events, ["verify", "reserve", "speak"]);
});

test("performance cues without spoken words stop before voice lookup, budget reservation or speech", async (t) => {
  let lookups = 0,
    reservations = 0,
    speech = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    lookups++;
    return { conversationConfig: { tts } };
  });
  t.mock.method(voice.elevenlabs!.textToSpeech, "stream", async () => {
    speech++;
  });
  await assert.rejects(
    voice.streamTextToSpeech("[happy] (sighs) *gently*", async () => {
      reservations++;
    }),
    /no question to read/i,
  );
  assert.equal(lookups, 0);
  assert.equal(reservations, 0);
  assert.equal(speech, 0);
});

test("read-aloud endpoint rejects cue-only input without spending and passes cleaned words to the same voice", async (t) => {
  const priorTestBypass = process.env.SECURITY_TEST_BYPASS;
  delete process.env.SECURITY_TEST_BYPASS;
  t.after(() => {
    if (priorTestBypass === undefined) delete process.env.SECURITY_TEST_BYPASS;
    else process.env.SECURITY_TEST_BYPASS = priorTestBypass;
  });
  const { prepareCollection } = await import("../src/lib/collection/create");
  const store = await import("../src/lib/collection/store");
  const { opaqueIdentifier } = await import("../src/lib/security/rate-limit");
  const { POST } = await import("../src/app/api/collection/[id]/speak/route");
  const budgetKey = `guard-${opaqueIdentifier("all-provider-actions:daily")}`;
  const spentBefore = await store.readRecord<{ count: number }>(budgetKey);
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Synthetic storyteller", email: "owner@example.test" },
    recipient: { name: "Synthetic recipient", email: "recipient@example.test" },
  });
  await store.putCollection(c);
  const savedBefore = await store.getCollection(c.id);
  let lookups = 0,
    speech = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    lookups++;
    return { conversationConfig: { tts } };
  });
  t.mock.method(
    voice.elevenlabs!.textToSpeech,
    "stream",
    async (voiceId: string, options: Record<string, unknown>) => {
      speech++;
      assert.equal(voiceId, tts.voiceId);
      assert.equal(options.modelId, "eleven_multilingual_v2");
      assert.deepEqual(options.voiceSettings, expectedSettings);
      assert.equal(options.text, "Was that [June 1956] (not 1957)?");
      assert.equal(
        (await store.readRecord<{ count: number }>(budgetKey))!.count,
        (spentBefore?.count ?? 0) + 1,
      );
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    },
  );
  const read = (text: string) =>
    POST(
      new NextRequest(
        `http://localhost/api/collection/${c.id}/speak?key=${c.ownerKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      ),
      { params: Promise.resolve({ id: c.id }) },
    );
  const noWords = await read("[happy] (sighs) *gently*");
  assert.equal(noWords.status, 400);
  assert.match((await noWords.json()).error, /no question to read/i);
  assert.equal(lookups, 0);
  assert.equal(speech, 0);
  assert.deepEqual(await store.readRecord(budgetKey), spentBefore);
  assert.deepEqual(await store.getCollection(c.id), savedBefore);

  const spoken = await read("[smile] Was that [June 1956] (not 1957)?");
  assert.equal(spoken.status, 200);
  assert.equal(spoken.headers.get("content-type"), "audio/mpeg");
  assert.match(spoken.headers.get("cache-control") || "", /no-store/);
  assert.equal(lookups, 1);
  assert.equal(speech, 1);
  assert.deepEqual(await store.getCollection(c.id), savedBefore);
});

test("agent verification failure never spends a speech allowance or selects a fallback voice", async (t) => {
  let speech = 0,
    reservations = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    throw new Error("Synthetic unavailable agent");
  });
  t.mock.method(voice.elevenlabs!.textToSpeech, "stream", async () => {
    speech++;
  });
  await assert.rejects(
    voice.streamTextToSpeech("A synthetic question.", async () => {
      reservations++;
    }),
    /voice could not be verified/,
  );
  await assert.rejects(film.resolveFilmVoice(), /voice could not be verified/);
  assert.equal(speech, 0);
  assert.equal(reservations, 0);
});

test("an agent without a voice cannot generate speech using a default voice", async (t) => {
  let speech = 0,
    reservations = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => ({
    conversationConfig: { tts: {} },
  }));
  t.mock.method(voice.elevenlabs!.textToSpeech, "stream", async () => {
    speech++;
  });
  await assert.rejects(
    voice.streamTextToSpeech("A synthetic question.", async () => {
      reservations++;
    }),
    /no narration voice/,
  );
  assert.equal(speech, 0);
  assert.equal(reservations, 0);
});

test("a speech provider failure propagates without another request or alternate voice", async (t) => {
  let speech = 0,
    reservations = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => ({
    conversationConfig: { tts },
  }));
  t.mock.method(
    voice.elevenlabs!.textToSpeech,
    "stream",
    async (voiceId: string) => {
      speech++;
      assert.equal(voiceId, tts.voiceId);
      throw new Error("Synthetic speech failure");
    },
  );
  await assert.rejects(
    voice.streamTextToSpeech("A synthetic question.", async () => {
      reservations++;
    }),
    /Synthetic speech failure/,
  );
  assert.equal(speech, 1);
  assert.equal(reservations, 1);
});

test("read-aloud endpoint returns a retryable unavailable message without changing the collection", async (t) => {
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    throw new Error("Synthetic unavailable agent");
  });
  let speech = 0;
  t.mock.method(voice.elevenlabs!.textToSpeech, "stream", async () => {
    speech++;
  });
  const { prepareCollection } = await import("../src/lib/collection/create");
  const { putCollection, getCollection } =
    await import("../src/lib/collection/store");
  const { POST } = await import("../src/app/api/collection/[id]/speak/route");
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Synthetic storyteller", email: "owner@example.test" },
    recipient: { name: "Synthetic recipient", email: "recipient@example.test" },
  });
  await putCollection(c);
  const savedBefore = await getCollection(c.id);
  const response = await POST(
    new NextRequest(
      `http://localhost/api/collection/${c.id}/speak?key=${c.ownerKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "A synthetic question." }),
      },
    ),
    { params: Promise.resolve({ id: c.id }) },
  );
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.match(result.error, /try again/i);
  assert.doesNotMatch(result.error, /browser|device voice/);
  assert.equal(speech, 0);
  assert.deepEqual(await getCollection(c.id), savedBefore);
});

test("an API key alone does not advertise a configured interviewer voice", async (t) => {
  delete process.env.ELEVENLABS_AGENT_ID;
  t.after(() => {
    process.env.ELEVENLABS_AGENT_ID = "synthetic-agent";
  });
  let lookups = 0;
  t.mock.method(voice.elevenlabs!.conversationalAi.agents, "get", async () => {
    lookups++;
  });
  assert.equal(voice.interviewerVoiceConfigured(), false);
  assert.equal(film.filmsAvailable(), false);
  const { prepareCollection } = await import("../src/lib/collection/create");
  const { publicView } = await import("../src/lib/collection/access");
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Synthetic", email: "owner@example.test" },
    recipient: { name: "Family", email: "family@example.test" },
  });
  assert.equal(publicView(c, "owner").capabilities.tts, false);
  await assert.rejects(voice.resolveInterviewerVoice(), /not configured/);
  assert.equal(lookups, 0);
});
