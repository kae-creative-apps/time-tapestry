import assert from "node:assert/strict";
import test from "node:test";
import { cleanTranscriptForReading } from "../src/lib/collection/transcript-reading";
import { draftChapters } from "../src/lib/collection/content";
import { syntheticFilmCollection } from "./film-fixture";

test("a reading copy removes simple pauses without altering the original source", () => {
  const original = "Um, I helped, uh, at the library. We um carried books.";
  assert.deepEqual(cleanTranscriptForReading(original), {
    text: "I helped at the library. We carried books.",
    removedFillers: 3,
  });
  assert.equal(
    original,
    "Um, I helped, uh, at the library. We um carried books.",
  );
});

test("cleanup keeps meaningful like, approximations, uncertainty and emphasis", () => {
  const original =
    "I like helping. It felt like home. I gave like $20, maybe. I really, really don't remember. She was like a sister to me.";
  assert.deepEqual(cleanTranscriptForReading(original), {
    text: original,
    removedFillers: 0,
  });
});

test("quoted words, affirmations, names, acronyms and containing words remain exact", () => {
  for (const original of [
    'She said, "Um, I am not sure." That mattered.',
    "He said ‘uh’ and waited.",
    "I wrote 'um' in the margin.",
    "I wrote `uh` in the margin.",
    "The word um appeared twice.",
    "Um Lee studied at UM.",
    "Uh-huh, that was our hummingbird in the summer.",
    'She said, "Um, I am not sure.',
    "She said 'Um, I'm not sure.' and waited.",
    'She said, "I think\nUm, perhaps I should wait."',
    "Uh? Why did she go?",
    "Um... I am not certain.",
    "Um. I think so.",
  ]) {
    assert.deepEqual(
      cleanTranscriptForReading(original),
      { text: original, removedFillers: 0 },
      original,
    );
  }
});

test("paragraphs, punctuation and adjacent pauses remain readable", () => {
  assert.equal(
    cleanTranscriptForReading("Um, uh, I helped.\n\nUh, we met again.").text,
    "I helped.\n\nwe met again.",
  );
  assert.equal(
    cleanTranscriptForReading("I helped, um. We met later.").text,
    "I helped. We met later.",
  );
  assert.equal(
    cleanTranscriptForReading("I think (um, perhaps) it was June.").text,
    "I think (perhaps) it was June.",
  );
});

test("hesitation-only answers are kept for the storyteller to review", () => {
  for (const original of ["Um.", "uh", "Um, uh.", ""]) {
    assert.deepEqual(cleanTranscriptForReading(original), {
      text: original,
      removedFillers: 0,
    });
  }
});

test("source-text drafts use the reading copy while stored answers remain exact", async (t) => {
  const previous = process.env.GLOO_API_KEY;
  delete process.env.GLOO_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.GLOO_API_KEY;
    else process.env.GLOO_API_KEY = previous;
  });
  const collection = syntheticFilmCollection();
  collection.takes[0].text =
    "Um, I like helping Aunt June. I gave, uh, like $20, maybe.";
  const snapshot = JSON.stringify(collection);
  const chapters = await draftChapters(collection, async () => {
    throw new Error("No provider call is allowed in the source-text fallback");
  });
  assert.equal(
    chapters[0].content,
    "I like helping Aunt June. I gave like $20, maybe.",
  );
  assert.equal(chapters[0].generatedWith, "source_text");
  assert.equal(chapters[0].editorialReviewed, false);
  assert.equal(JSON.stringify(collection), snapshot);
});
