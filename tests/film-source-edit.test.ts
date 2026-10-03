import test from "node:test";
import assert from "node:assert/strict";
import { syntheticFilmCollection } from "./film-fixture";
import { assembleSourceEdits } from "../src/lib/collection/films/source-edit";
import type { SourceWord } from "../src/lib/collection/films/word-matching";
import type { StoryFilmJob } from "../src/lib/collection/films/types";

function fixture() {
  const c = syntheticFilmCollection();
  const sentences = [
    "My grandmother kept a blue notebook beside her kitchen window and wrote a kind message every morning before her neighbors came to visit.",
    "A private detail",
    "We carried those notes down the street together and that daily kindness became the example I wanted to follow for the rest of my life.",
    "I learned patience while helping a friend repair an old bicycle.",
    "A quiet walk through the garden reminded me to pay attention.",
    "I hope the next generation will make time to listen.",
  ];
  const mediaId = "synthetic_media_123";
  c.takes = [];
  c.selectedTakeIds = {};
  const turns = sentences.map((text, i) => ({
    id: `synthetic_turn_${i}`,
    role: "user" as const,
    chapterId: `q${Math.max(1, i - 1)}` as "q1" | "q2" | "q3" | "q4",
    sequence: i,
    capturedAt: c.createdAt,
    timing: "unaligned" as const,
    text,
  }));
  c.interviews = [
    {
      id: "synthetic_session",
      provider: "guided",
      status: "completed",
      startedAt: c.createdAt,
      excludedTurnIds: [turns[1].id],
      segments: [
        {
          id: "synthetic_segment",
          mediaId,
          kind: "video",
          startMs: 0,
          durationMs: 60000,
          createdAt: c.createdAt,
        },
      ],
      turns,
    },
  ];
  c.chapters.forEach((chapter) => {
    chapter.sourceTakeIds = turns
      .filter(
        (turn) => turn.chapterId === chapter.id && turn.id !== turns[1].id,
      )
      .map((turn) => `live-${turn.id}`);
  });
  const job = {
    mode: "original",
    preparation: "automatic",
    automaticPresentation: "video",
    chapters: c.chapters.map((chapter, i) => ({
      chapterId: chapter.id,
      chapterNumber: i + 1,
      title: chapter.title,
      content: chapter.content,
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: "source",
      status: "queued",
      progress: 0,
    })),
    originalSources: [
      {
        mediaId,
        chapterIds: c.chapters.map((ch) => ch.id),
        sourceTakeIds: c.chapters.flatMap((ch) => ch.sourceTakeIds),
      },
    ],
  } as StoryFilmJob;
  let tick = 0;
  const wordGroups = sentences.map((text, i) => {
    if (i === 2) tick += 6000;
    return text.split(" ").map((text) => {
      const word = {
        text,
        startMs: tick,
        endMs: tick + 200,
        mediaId,
        speakerId: "speaker_0",
      };
      tick += 300;
      return word;
    });
  });
  return {
    c,
    job,
    words: wordGroups.flat(),
    wordGroups,
    durations: new Map([[mediaId, 60000]]),
  };
}

test("separate accepted turns never include an excluded answer or intervening pause", async () => {
  const f = fixture();
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  const clips = result.chapters[0].sourceEdit!.clips;
  assert.equal(clips.length, 2, "each answer needs its own verified passage");
  assert.ok(
    !JSON.stringify(clips).includes("private"),
    "excluded source words must not be retained inside a combined cut",
  );
  assert.ok(clips[0].outMs < f.wordGroups[1][0].startMs + 1);
  assert.ok(clips[1].inMs >= f.wordGroups[2][0].startMs - 140);
});

import {
  captionsForWords,
  sessionWordTimeline,
  validateSourceWords,
} from "../src/lib/collection/films/word-matching";

test("short answers use verified adjacent passages and never borrow a different speaker", async () => {
  const f = fixture();
  const turn = f.c.interviews![0].turns[1];
  turn.text = "Yes";
  turn.chapterId = "q1";
  f.c.interviews![0].excludedTurnIds = [];
  f.c.chapters[0].sourceTakeIds.splice(1, 0, `live-${turn.id}`);
  f.words = [
    ...f.wordGroups[0],
    { ...f.wordGroups[1][0], text: "Yes" },
    ...f.wordGroups.slice(2).flat(),
  ];
  const run = () =>
    assembleSourceEdits(
      f.c,
      f.job,
      new Map([[f.words[0].mediaId, f.words]]),
      f.durations,
      [],
    );
  const result = await run();
  assert.equal(result.chapters[0].sourceEdit!.clips.length, 3);
  assert.equal(
    result.chapters[0].sourceEdit!.clips[1].captions![0].text,
    "Yes",
  );
  f.words[f.wordGroups[0].length].speakerId = "speaker_1";
  await assert.rejects(run(), /neighboring storyteller/);
});

test("timed rollover duplication is removed but a later repeated memory remains", () => {
  const first: SourceWord[] = [
    { text: "I", startMs: 0, endMs: 250, mediaId: "first" },
    { text: "remember", startMs: 300, endMs: 550, mediaId: "first" },
    { text: "blue", startMs: 600, endMs: 850, mediaId: "first" },
    { text: "notebooks", startMs: 900, endMs: 1150, mediaId: "first" },
  ];
  const second: SourceWord[] = [
    { text: "blue", startMs: 0, endMs: 250, mediaId: "second" },
    { text: "notebooks", startMs: 300, endMs: 550, mediaId: "second" },
    { text: "beside", startMs: 600, endMs: 850, mediaId: "second" },
    { text: "windows", startMs: 900, endMs: 1150, mediaId: "second" },
  ];
  const words = new Map([
      ["first", first],
      ["second", second],
    ]),
    durations = new Map([
      ["first", 1200],
      ["second", 1200],
    ]);
  const rollover = sessionWordTimeline(
    [
      { mediaId: "first", startMs: 0 },
      { mediaId: "second", startMs: 600 },
    ],
    words,
    durations,
  );
  assert.equal(
    rollover.matchableWords.map((word) => word.text).join(" "),
    "I remember blue notebooks beside windows",
  );
  const later = sessionWordTimeline(
    [
      { mediaId: "first", startMs: 0 },
      { mediaId: "second", startMs: 5000 },
    ],
    words,
    durations,
  );
  assert.equal(later.matchableWords.length, 8);
});

test("slightly overlapping source words do not create overlapping caption cards", () => {
  const words: SourceWord[] = [
    {
      text: "This is a deliberately long caption close to the next caption boundary",
      startMs: 0,
      endMs: 900,
      mediaId: "source",
    },
    { text: "with", startMs: 850, endMs: 1000, mediaId: "source" },
    { text: "another sentence", startMs: 1050, endMs: 1600, mediaId: "source" },
  ];
  validateSourceWords(words, 2000, "source");
  const captions = captionsForWords(words);
  assert.equal(captions.length, 2);
  assert.ok(captions[0].endMs <= captions[1].startMs);
  assert.ok(captions[0].text.endsWith("with"));
});

import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cachedSourceTranscript } from "../src/lib/collection/films/transcript-cache";

test("byte-identical recordings reuse a private transcript across upload IDs and job attempts", async () => {
  const cacheRoot = await mkdtemp(
    path.join(os.tmpdir(), "film-transcript-cache-"),
  );
  let requests = 0;
  const request = async () => {
    requests++;
    return [{ text: "Example", startMs: 0, endMs: 100, mediaId: "first" }];
  };
  const options = {
    cacheRoot,
    sourceSha256: "a".repeat(64),
    durationMs: 1000,
    mediaId: "first",
    attempt: 1,
    request,
  };
  await cachedSourceTranscript(options);
  const reused = await cachedSourceTranscript({
    ...options,
    mediaId: "second",
    attempt: 2,
  });
  assert.equal(requests, 1);
  assert.equal(reused[0].mediaId, "second");
  await assert.rejects(
    cachedSourceTranscript({ ...options, durationMs: 50 }),
    /timestamps outside/,
  );
  assert.equal(
    requests,
    1,
    "invalid cached timing must not start another paid request",
  );
});
