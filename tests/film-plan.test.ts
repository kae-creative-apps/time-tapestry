import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignedWords,
  collectionFilmSourceHash,
  filmChapters,
  filmVersionHash,
  narrationScript,
  sha256,
  splitNarration,
  validateNarratedFilmPlan,
} from "../src/lib/collection/films/plan";
import { syntheticFilmCollection, testVoice } from "./film-fixture";
import type { NarratedFilmPlan } from "../src/lib/collection/films/types";

test("narration includes the full reviewed story verbatim with an AI disclosure", () => {
  const c = syntheticFilmCollection();
  for (const [i, chapter] of filmChapters(c).entries()) {
    assert.ok(chapter.script.endsWith(c.chapters[i].content));
    assert.match(chapter.script, /AI interviewer/);
    assert.equal(chapter.scriptSha256, sha256(chapter.script));
    assert.deepEqual(chapter.sourceTakeIds, c.chapters[i].sourceTakeIds);
  }
});
test("story source, title, selection and voice changes invalidate a film version", () => {
  const c = syntheticFilmCollection();
  const hash = collectionFilmSourceHash(c);
  const changed = structuredClone(c);
  changed.chapters[0].content += " A reviewed correction.";
  assert.notEqual(collectionFilmSourceHash(changed), hash);
  changed.chapters[0].sourceTakeIds = ["unselected"];
  assert.throws(() => filmChapters(changed), /source answers changed/);
  assert.notEqual(
    filmVersionHash(hash, testVoice),
    filmVersionHash(hash, { ...testVoice, voiceId: "different" }),
  );
});
test("long narration chunks preserve every character and Unicode pair", () => {
  const text = "A complete sentence with a memory. 🌱 ".repeat(200);
  const chunks = splitNarration(text, 120);
  assert.equal(chunks.join(""), text);
  assert.ok(
    chunks.every(
      (chunk) => chunk.length <= 120 && !/[\uD800-\uDBFF]$/.test(chunk),
    ),
  );
  assert.throws(
    () => narrationScript("Name", "Title", "x".repeat(32001)),
    /nothing has been truncated/,
  );
});
test("timing is derived from source characters, rejects corrupt time and long films", () => {
  const script = "Hello world.";
  const words = alignedWords({
    characters: [...script],
    characterStartTimesSeconds: [...script].map((_, i) => i / 10),
    characterEndTimesSeconds: [...script].map((_, i) => (i + 1) / 10),
  });
  assert.deepEqual(
    words.map((word) => word.text),
    ["Hello", "world."],
  );
  const plan: NarratedFilmPlan = {
    schemaVersion: 1,
    jobId: "job",
    chapterId: "q1",
    chapterNumber: 1,
    storytellerName: "Alex",
    title: "Story",
    script,
    sourceTakeIds: ["source"],
    sourceSha256: sha256("source"),
    scriptSha256: sha256(script),
    audioSha256: sha256("audio"),
    audioDurationMs: 2000,
    words,
    narrationKind: "ai_interviewer",
    templateVersion: "narrated-story-v1",
  };
  assert.equal(validateNarratedFilmPlan(plan), plan);
  assert.throws(
    () => validateNarratedFilmPlan({ ...plan, audioDurationMs: 3600000 }),
    /one hour/,
  );
  assert.throws(
    () => validateNarratedFilmPlan({ ...plan, script: "Changed" }),
    /provenance/,
  );
  assert.throws(
    () =>
      validateNarratedFilmPlan({
        ...plan,
        words: [{ text: "invalid", startMs: 1000, endMs: 3000 }],
      }),
    /timing|complete reviewed script/,
  );
});
