import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { syntheticFilmCollection } from "./film-fixture";
import {
  matchSourceWords,
  cutsForMatchedWords,
  validateSourceWords,
  type SourceWord,
} from "../src/lib/collection/films/word-matching";
let validateMeasuredCuts: typeof import("../src/lib/collection/films/original-render").validateMeasuredCuts;
let store: typeof import("../src/lib/collection/store");
let jobs: typeof import("../src/lib/collection/films/jobstore");
let plans: typeof import("../src/lib/collection/films/original-plan");
before(async () => {
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "VERCEL",
    "ELEVENLABS_API_KEY",
  ])
    delete process.env[key];
  process.env.COLLECTION_DATA_DIR = await mkdtemp(
    path.join(os.tmpdir(), "film-original-test-"),
  );
  store = await import("../src/lib/collection/store");
  assert.equal(
    store.dataRoot,
    process.env.COLLECTION_DATA_DIR,
    "film tests must use their isolated temporary store",
  );
  ({ validateMeasuredCuts } =
    await import("../src/lib/collection/films/original-render"));
  jobs = await import("../src/lib/collection/films/jobstore");
  plans = await import("../src/lib/collection/films/original-plan");
});
async function fixture() {
  const c = syntheticFilmCollection();
  for (const [index, take] of c.takes.entries()) {
    const mediaId = `original_${take.id}`;
    take.kind = "video";
    take.mediaId = mediaId;
    take.durationSeconds = 12;
    const file = path.join(store.dataRoot, `${mediaId}.mp4`);
    await writeFile(file, `synthetic source ${index}`);
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "synthetic.mp4",
      bytes: 18,
      createdAt: c.createdAt,
      localPath: file,
    });
  }
  await store.putCollection(c);
  return c;
}
const words = (text: string, mediaId = "source_123") =>
  text.split(" ").map((text, i): SourceWord => ({
    text,
    mediaId,
    startMs: i * 400 + 100,
    endMs: i * 400 + 350,
    speakerId: "speaker_0",
  }));
test("word matching retains complete unique answer, source timestamps and natural gaps", () => {
  const source = words(
    "hello welcome I learned patience while fixing a bicycle thank you",
  );
  const result = matchSourceWords(
    "I learned patience while fixing a bicycle",
    source,
  );
  assert.equal(
    result.words.map((word) => word.text).join(" "),
    "I learned patience while fixing a bicycle",
  );
  const cuts = cutsForMatchedWords(
    result.words,
    source,
    new Map([["source_123", 6000]]),
  );
  assert.ok(cuts[0].inMs <= result.words[0].startMs);
  assert.ok(cuts[0].outMs >= result.words.at(-1)!.endMs);
  assert.equal(cuts[0].captions![0].startMs, result.words[0].startMs);
});
test("ambiguous, unrelated, multiple speaker and out of range timestamps stop automatic cuts", () => {
  assert.throws(
    () =>
      matchSourceWords(
        "I remember the blue bicycle",
        words("I remember the blue bicycle and I remember the blue bicycle"),
      ),
    /more than once/,
  );
  assert.throws(
    () =>
      matchSourceWords(
        "I remember the blue bicycle",
        words("the kitchen was a very different place"),
      ),
    /confidently/,
  );
  const mixed = words("I remember the blue bicycle");
  mixed[3].speakerId = "speaker_1";
  assert.throws(
    () => matchSourceWords("I remember the blue bicycle", mixed),
    /more than one/,
  );
  assert.throws(
    () => validateSourceWords(words("hello there"), 500, "source_123"),
    /timestamps outside/,
  );
  assert.throws(
    () =>
      validateMeasuredCuts(
        [{ mediaId: "source_123", inMs: 0, outMs: 501 }],
        new Map([["source_123", 500]]),
      ),
    /measured length/,
  );
});
test("manual edit protects stale tabs and rejects unrelated or foreign media", async () => {
  const c = await fixture();
  const chapters = c.chapters.map((chapter, i) => ({
    chapterId: chapter.id,
    presentation: "video",
    clips: [{ mediaId: c.takes[i].mediaId!, inMs: 0, outMs: 1000 }],
  }));
  const saved = await plans.saveOriginalFilmEdit(c, chapters, null);
  await assert.rejects(
    plans.saveOriginalFilmEdit(c, chapters, null),
    /another tab/,
  );
  const invalid = structuredClone(chapters);
  invalid[0].clips[0].mediaId = c.takes[1].mediaId!;
  await assert.rejects(
    plans.saveOriginalFilmEdit(c, invalid, saved.revisionHash),
    /not an original source/,
  );
  const job = await jobs.enqueueOriginalFilms(
    c,
    saved.revisionHash,
    true,
    true,
  );
  assert.equal(job.voice, undefined);
  assert.equal(job.mode, "original");
  const media = (await store.getMedia(c.takes[0].mediaId!))!;
  await store.putMedia({ ...media, collectionId: "foreign_collection" });
  assert.equal(await jobs.filmJobInputsCurrent(job, c), false);
});
test("automatic enqueue is provider free, idempotent after duration cache, and fences old presentations", async () => {
  const c = await fixture();
  const first = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  assert.equal(first.preparation, "automatic");
  assert.equal(first.voice, undefined);
  const media = (await store.getMedia(c.takes[0].mediaId!))!;
  await store.mutateRecord(plans.originalProbeKey(media.id), () => ({
    mediaId: media.id,
    metadataSha256: plans.sourceMetadataHash(media),
    sourceSha256: "a".repeat(64),
    durationMs: 11987,
  }));
  const second = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  assert.equal(first.id, second.id);
  await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
    presentation: "audio",
  });
  assert.equal(
    await jobs.claimNextFilmJob("worker", Date.now(), first.id),
    null,
  );
  assert.equal((await jobs.getFilmJob(first.id))?.status, "stale");
});
test("original transient retries and lease crashes are bounded with a durable future retry time", async () => {
  const c = await fixture();
  const queued = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  let claimed = (await jobs.claimNextFilmJob("worker", Date.now(), queued.id))!;
  const retry = await jobs.failFilmJob(
    queued.id,
    claimed.lease!.token,
    "Transcription returned HTTP 503",
    false,
    true,
  );
  assert.equal(retry.status, "queued");
  assert.ok(Date.parse(retry.nextAttemptAt!) > Date.now());
  assert.equal(
    await jobs.claimNextFilmJob("too-soon", Date.now(), queued.id),
    null,
  );
  claimed = (await jobs.claimNextFilmJob(
    "worker",
    Date.now() + 31000,
    queued.id,
  ))!;
  await store.mutateRecord(queued.id, (job: any) => ({
    ...job,
    lease: { ...job.lease, expiresAt: 1 },
  }));
  await jobs.claimNextFilmJob("recovery", Date.now(), queued.id);
  assert.equal((await jobs.getFilmJob(queued.id))?.status, "queued");
  claimed = (await jobs.claimNextFilmJob(
    "worker",
    Date.now() + 62000,
    queued.id,
  ))!;
  assert.equal(
    (
      await jobs.failFilmJob(
        queued.id,
        claimed.lease!.token,
        "Transcription returned HTTP 503",
        false,
        true,
      )
    ).status,
    "failed",
  );
});

test("rollover edges use matched words once and never split a word", () => {
  const first = words(
    "The memory I want to keep is how I remember the blue notebook beside",
    "source_first",
  );
  const second = words(
    "notebook beside her kitchen window every morning before she left for work",
    "source_second",
  );
  const source = [...first, ...second];
  const match = matchSourceWords(
    "The memory I want to keep is how I remember the blue notebook beside her kitchen window every morning before she left for work",
    source,
  );
  const cuts = cutsForMatchedWords(
    match.words,
    source,
    new Map([
      ["source_first", 6000],
      ["source_second", 5500],
    ]),
  );
  assert.equal(cuts.length, 2);
  const caption = cuts
    .flatMap((cut) => cut.captions!)
    .map((item) => item.text)
    .join(" ");
  assert.equal(
    caption,
    "The memory I want to keep is how I remember the blue notebook beside her kitchen window every morning before she left for work",
  );
});

test("unverified beginning or ending words do not produce partial-thought cuts", () => {
  const story =
    "I remember the blue bicycle beside the kitchen window every morning before school and after the long walk home together with everyone who waited there patiently for us each afternoon";
  assert.equal(story.split(" ").length, 30);
  assert.throws(
    () =>
      matchSourceWords(
        "Never forget how we walked all the way home together that night",
        words(
          "Always forget how we walked all the way home together that night",
        ),
      ),
    /boundaries/,
  );
  assert.throws(
    () => matchSourceWords(`Never ${story}`, words(story)),
    /boundaries/,
  );
  assert.throws(
    () => matchSourceWords(`${story} night`, words(story)),
    /boundaries/,
  );
  assert.throws(
    () => matchSourceWords(`${story} so`, words(story)),
    /boundaries/,
    "a trailing word that can carry meaning is not treated as filler",
  );
});

test("filler and backchannel drift at the answer edges keeps the spoken source word", () => {
  const story =
    "I remember the blue bicycle beside the kitchen window every morning before school and after the long walk home together with everyone who waited there patiently for us each afternoon";
  const spoken = words(`Yes ${story} yes`);
  const swapped = matchSourceWords(`Yeah ${story} yeah`, spoken);
  assert.equal(swapped.words[0].text, "Yes");
  assert.equal(swapped.words.at(-1)!.text, "yes");
  assert.equal(
    swapped.words.map((word) => word.text).join(" "),
    `Yes ${story} yes`,
  );
  const omitted = matchSourceWords(`Um well ${story} um`, words(story));
  assert.equal(omitted.words.map((word) => word.text).join(" "), story);
  assert.throws(
    () => matchSourceWords(`Um uh well ${story}`, words(story)),
    /boundaries/,
  );
});

test("automatic API requires owner processing consent and reports the real queued mode", async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SECURITY_LOCAL_BYPASS: "true",
    SECURITY_TEST_BYPASS: "true",
    ELEVENLABS_API_KEY: "synthetic-unused",
  });
  try {
    const { NextRequest } = await import("next/server");
    const route = await import("../src/app/api/collection/[id]/films/route");
    const c = await fixture();
    const context = { params: Promise.resolve({ id: c.id }) };
    const request = (key: string, body: object) =>
      new NextRequest(
        `http://localhost/api/collection/${c.id}/films?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    assert.equal(
      (
        await route.POST(
          request(c.recipientKey, {
            action: "prepare_automatic",
            processingApproved: true,
          }),
          context,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await route.POST(
          request(c.ownerKey, { action: "prepare_automatic" }),
          context,
        )
      ).status,
      400,
    );
    await jobs.writeWorkerHeartbeat("api-test");
    const response = await route.POST(
      request(c.ownerKey, {
        action: "prepare_automatic",
        processingApproved: true,
      }),
      context,
    );
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.job.mode, "original");
    assert.equal(body.job.preparation, "automatic");
    assert.equal(body.job.status, "queued");
    assert.equal(body.automaticAvailable, true);
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
  }
});
