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

test("live source matching removes only a safely bounded filler from actual retained ranges and captions", async () => {
  const f = fixture();
  f.wordGroups[0][3].text = "um,";
  f.c.interviews![0].turns[0].text = f.wordGroups[0]
    .map((word) => word.text)
    .join(" ");
  for (const word of f.words) {
    word.startMs = word.startMs * 2 + 200;
    word.endMs = word.startMs + 200;
  }
  f.durations.set(f.words[0].mediaId, f.words.at(-1)!.endMs + 500);
  const original = structuredClone(f.c);
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  const edit = result.chapters[0].sourceEdit!;
  assert.equal(edit.clips.length, 3);
  assert.equal(edit.cleanup!.removed.length, 1);
  assert.equal(edit.cleanup!.removed[0].reason, "filler");
  assert.equal(edit.cleanup!.removed[0].text, "um,");
  assert.ok(
    !edit.clips
      .flatMap((clip) => clip.captions ?? [])
      .some((caption) => /\bum\b/.test(caption.text)),
  );
  for (const word of [...f.wordGroups[0], ...f.wordGroups[2]].filter(
    (word) => word.text !== "um,",
  )) {
    assert.equal(
      edit.clips.filter(
        (clip) => clip.inMs <= word.startMs && clip.outMs >= word.endMs,
      ).length,
      1,
      word.text,
    );
  }
  assert.deepEqual(f.c, original);
});

function classicFixture(
  sentence = "I remember the um blue notebook beside our window.",
) {
  const c = syntheticFilmCollection();
  const wordsByMedia = new Map<string, SourceWord[]>();
  const durations = new Map<string, number>();
  c.takes.forEach((take, index) => {
    take.kind = "voice";
    take.mediaId = `source_${index}_synthetic`;
    take.text =
      index === 0
        ? sentence
        : "We remember these moments together with our family.";
    const words = take.text
      .split(" ")
      .map((text, i) => ({
        mediaId: take.mediaId!,
        text,
        startMs: 200 + i * 600,
        endMs: 400 + i * 600,
        speakerId: "storyteller",
      }));
    wordsByMedia.set(take.mediaId, words);
    durations.set(take.mediaId, words.at(-1)!.endMs + 500);
  });
  const job = {
    mode: "original",
    preparation: "automatic",
    automaticPresentation: "audio",
    chapters: c.chapters.map((chapter, index) => ({
      chapterId: chapter.id,
      chapterNumber: index + 1,
      title: chapter.title,
      content: chapter.content,
      sourceTakeIds: chapter.sourceTakeIds,
      sourceSha256: "source",
      status: "queued",
      progress: 0,
    })),
    originalSources: c.takes.map((take) => ({
      mediaId: take.mediaId,
      chapterIds: [take.questionId],
      sourceTakeIds: [take.id],
    })),
  } as StoryFilmJob;
  return { c, job, wordsByMedia, durations };
}

test("classic answers get the same source cleanup while waveform-only changes produce different edit hashes", async () => {
  const f = classicFixture();
  const original = structuredClone(f.c);
  const first = await assembleSourceEdits(
    f.c,
    f.job,
    f.wordsByMedia,
    f.durations,
    [],
  );
  assert.equal(first.chapters[0].sourceEdit!.clips.length, 2);
  assert.equal(
    first.chapters[0].sourceEdit!.cleanup!.removed[0].reason,
    "filler",
  );
  assert.equal(first.chapters[1].sourceEdit!.clips.length, 1);
  const source = f.c.takes[1].mediaId!;
  const words = f.wordsByMedia.get(source)!;
  words.slice(4).forEach((word) => {
    word.startMs += 3000;
    word.endMs += 3000;
  });
  f.durations.set(source, f.durations.get(source)! + 3000);
  const noEvidence = await assembleSourceEdits(
    f.c,
    f.job,
    f.wordsByMedia,
    f.durations,
    [],
  );
  const withEvidence = await assembleSourceEdits(
    f.c,
    f.job,
    f.wordsByMedia,
    f.durations,
    [],
    async () => {},
    new Map([
      [source, [{ inMs: words[3].endMs + 100, outMs: words[4].startMs - 100 }]],
    ]),
  );
  assert.equal(noEvidence.chapters[1].sourceEdit!.clips.length, 1);
  assert.equal(withEvidence.chapters[1].sourceEdit!.clips.length, 2);
  assert.notEqual(
    withEvidence.chapters[1].sourceSha256,
    noEvidence.chapters[1].sourceSha256,
  );
  const repeated = await assembleSourceEdits(
    f.c,
    f.job,
    f.wordsByMedia,
    f.durations,
    [],
    async () => {},
    new Map([
      [source, [{ inMs: words[3].endMs + 100, outMs: words[4].startMs - 100 }]],
    ]),
  );
  assert.equal(
    repeated.chapters[1].sourceSha256,
    withEvidence.chapters[1].sourceSha256,
  );
  assert.deepEqual(f.c, original);
});

test("cleanup beyond 500 clips preserves the original passage and clears removed-range provenance", async () => {
  const f = classicFixture(
    Array.from({ length: 500 }, () => "I remember um the blue notebook").join(
      " ",
    ),
  );
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    f.wordsByMedia,
    f.durations,
    [],
  );
  const edit = result.chapters[0].sourceEdit!;
  assert.equal(edit.clips.length, 1);
  assert.equal(edit.clips[0].inMs, 0);
  assert.equal(edit.clips[0].outMs, f.durations.get(f.c.takes[0].mediaId!));
  assert.equal(edit.cleanup!.skippedReason, "clip_limit");
  assert.deepEqual(edit.cleanup!.removed, []);
  assert.match(edit.clips[0].captions![0].text, /\bum\b/);
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
