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
        languageCode: "eng",
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

test("an unspoken short backchannel does not discard the verified answers", async () => {
  const f = fixture();
  const session = f.c.interviews![0];
  session.turns.splice(3, 0, {
    id: "synthetic_turn_hmm",
    role: "user",
    chapterId: "q2",
    sequence: 0,
    capturedAt: f.c.createdAt,
    timing: "unaligned",
    text: "Hmm.",
  });
  session.turns.forEach((turn, index) => {
    turn.sequence = index;
  });
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  assert.ok(
    result.chapters.some((chapter) => chapter.sourceEdit!.clips.length > 0),
  );
  assert.equal(JSON.stringify(result).includes("Hmm"), false);
});

test("an untimed word in excluded speech stays in the original transcript without blocking verified answers", async () => {
  const f = fixture();
  const excludedWord = f.wordGroups[1][1];
  excludedWord.endMs = excludedWord.startMs;
  const original = structuredClone(f.words);
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  assert.equal(result.chapters.length, 4);
  assert.ok(
    result.chapters.every((chapter) => chapter.sourceEdit!.clips.length > 0),
  );
  assert.ok(
    result.chapters.every((chapter) =>
      chapter.sourceEdit!.clips.every((clip) =>
        (clip.captions ?? []).every(
          (caption) => caption.endMs > caption.startMs,
        ),
      ),
    ),
  );
  assert.deepEqual(f.words, original);
});

test("a selected untimed word is skipped and the timed words still assemble", async () => {
  const f = fixture();
  const selectedWord = f.wordGroups[0][3];
  const original = structuredClone(f.c);
  selectedWord.endMs = selectedWord.startMs;
  const originalWords = structuredClone(f.words);
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  assert.equal(result.chapters.length, 4);
  assert.ok(
    result.chapters.every((chapter) => chapter.sourceEdit!.clips.length > 0),
  );
  assert.ok(
    result.chapters.every((chapter) =>
      chapter.sourceEdit!.clips.every((clip) =>
        (clip.captions ?? []).every(
          (caption) => caption.endMs > caption.startMs,
        ),
      ),
    ),
  );
  assert.equal(selectedWord.endMs, selectedWord.startMs);
  assert.deepEqual(f.words, originalWords);
  assert.deepEqual(f.c, original);
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
    const words = take.text.split(" ").map((text, i) => ({
      mediaId: take.mediaId!,
      text,
      startMs: 200 + i * 600,
      endMs: 400 + i * 600,
      speakerId: "storyteller",
      languageCode: "eng",
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

test("an interviewer question between two halves of one answer is left out of the film", async () => {
  const f = fixture();
  const mediaId = f.words[0].mediaId;
  const answer = f.c.interviews![0].turns[0].text;
  const parts = answer.split(" ");
  const midpoint = Math.ceil(parts.length / 2);
  const question =
    "What did she write down and who received those morning messages from her";
  const questionTokens = question.split(" ");
  const shift = questionTokens.length * 300 + 400;
  const group = f.wordGroups[0];
  for (const word of group.slice(midpoint)) {
    word.startMs += shift;
    word.endMs += shift;
  }
  for (const later of f.wordGroups.slice(1)) {
    for (const word of later) {
      word.startMs += shift;
      word.endMs += shift;
    }
  }
  const inserted: SourceWord[] = questionTokens.map((text, index) => {
    const startMs = group[midpoint - 1].endMs + 80 + index * 300;
    return {
      text,
      startMs,
      endMs: startMs + 200,
      mediaId,
      speakerId: "speaker_1",
      languageCode: "eng",
    };
  });
  const words = [
    ...group.slice(0, midpoint),
    ...inserted,
    ...group.slice(midpoint),
    ...f.wordGroups.slice(1).flat(),
  ];
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[mediaId, words]]),
    f.durations,
    [],
  );
  const caption = JSON.stringify(
    result.chapters.flatMap((chapter) =>
      chapter.sourceEdit!.clips.flatMap((clip) => clip.captions ?? []),
    ),
  );
  assert.equal(caption.includes("received"), false);
  assert.equal(caption.includes("messages"), false);
  const firstChapter = result.chapters[0].sourceEdit!.clips;
  assert.ok(firstChapter.length >= 3);
  assert.ok(firstChapter[0].outMs <= inserted[0].startMs);
  assert.ok(firstChapter[1].inMs >= inserted.at(-1)!.endMs);
});

test("interviewer words labeled as the storyteller are left out of the film", async () => {
  const f = fixture();
  const mediaId = f.words[0].mediaId;
  const answer = f.c.interviews![0].turns[0].text;
  const parts = answer.split(" ");
  const midpoint = Math.ceil(parts.length / 2);
  const question =
    "What did she write down and who received those morning messages from her";
  const questionTokens = question.split(" ");
  const shift = questionTokens.length * 300 + 400;
  const group = f.wordGroups[0];
  for (const word of group.slice(midpoint)) {
    word.startMs += shift;
    word.endMs += shift;
  }
  for (const later of f.wordGroups.slice(1)) {
    for (const word of later) {
      word.startMs += shift;
      word.endMs += shift;
    }
  }
  const inserted: SourceWord[] = questionTokens.map((text, index) => {
    const startMs = group[midpoint - 1].endMs + 80 + index * 300;
    return {
      text,
      startMs,
      endMs: startMs + 200,
      mediaId,
      speakerId: "speaker_0",
      languageCode: "eng",
    };
  });
  const words = [
    ...group.slice(0, midpoint),
    ...inserted,
    ...group.slice(midpoint),
    ...f.wordGroups.slice(1).flat(),
  ];
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[mediaId, words]]),
    f.durations,
    [],
  );
  const caption = JSON.stringify(
    result.chapters.flatMap((chapter) =>
      chapter.sourceEdit!.clips.flatMap((clip) => clip.captions ?? []),
    ),
  );
  assert.equal(caption.includes("received"), false);
  assert.equal(caption.includes("messages"), false);
  const firstClips = result.chapters[0].sourceEdit!.clips;
  assert.ok(firstClips[0].outMs <= inserted[0].startMs);
  assert.ok(firstClips[1].inMs >= inserted.at(-1)!.endMs);
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

test("cached untimed alignment tokens are reused unchanged without a second transcription request", async () => {
  const cacheRoot = await mkdtemp(
    path.join(os.tmpdir(), "film-transcript-untimed-test-"),
  );
  const words: SourceWord[] = [
    { text: "Example", startMs: 10, endMs: 100, mediaId: "first" },
    { text: "yes", startMs: 120, endMs: 120, mediaId: "first" },
  ];
  let requests = 0;
  const options = {
    cacheRoot,
    sourceSha256: "b".repeat(64),
    durationMs: 1000,
    mediaId: "first",
    attempt: 1,
    request: async () => {
      requests++;
      return words;
    },
  };
  assert.deepEqual(await cachedSourceTranscript(options), words);
  const reused = await cachedSourceTranscript({
    ...options,
    mediaId: "second",
    attempt: 2,
  });
  assert.equal(requests, 1);
  assert.deepEqual(
    reused,
    words.map((word) => ({ ...word, mediaId: "second" })),
  );
  assert.throws(() => captionsForWords(reused), /positive duration/);
  assert.equal(
    requests,
    1,
    "selected timing failure must not re-spend on Scribe",
  );
});

async function withMatchLogs(run: () => Promise<unknown>) {
  const logs: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    return { result: await run(), logs };
  } finally {
    console.info = original;
  }
}

test("an answer missing from the recording is logged and the later answers still match", async () => {
  const f = fixture();
  const skipped =
    "The orchard was a very different place entirely yesterday afternoon";
  const turn = {
    id: "synthetic_turn_unmatched",
    role: "user" as const,
    chapterId: "q1" as const,
    sequence: -1,
    capturedAt: f.c.createdAt,
    timing: "unaligned" as const,
    text: skipped,
  };
  f.c.interviews![0].turns.unshift(turn);
  f.c.chapters[0].sourceTakeIds.unshift(`live-${turn.id}`);
  const { result, logs } = await withMatchLogs(() =>
    assembleSourceEdits(
      f.c,
      f.job,
      new Map([[f.words[0].mediaId, f.words]]),
      f.durations,
      [],
    ),
  );
  const assembled = result as Awaited<ReturnType<typeof assembleSourceEdits>>;
  const q1 = assembled.chapters[0];
  assert.equal(q1.status, "preparing");
  assert.equal(q1.error, undefined);
  assert.ok(q1.sourceEdit!.clips.length >= 1);
  assert.match(JSON.stringify(q1.sourceEdit!.clips), /grandmother/);
  assert.ok(q1.sourceEdit!.clips[0].inMs <= f.wordGroups[0][0].startMs + 1);
  const logged = logs.join("\n");
  assert.match(logged, /film_answer_not_in_recording/);
  assert.match(logged, /synthetic_turn_unmatched/);
  assert.equal(logged.includes("orchard"), false);
  assert.equal(logged.includes(skipped), false);
  for (const chapter of assembled.chapters.slice(1)) {
    assert.equal(chapter.status, "preparing");
    assert.equal(chapter.error, undefined);
  }
});

test("a chapter fails alone when its own answers are missing from the recording", async () => {
  const f = fixture();
  const skipped =
    "The orchard was a very different place entirely yesterday afternoon";
  const q4Turn = f.c.interviews![0].turns[5];
  q4Turn.text = skipped;
  const { result, logs } = await withMatchLogs(() =>
    assembleSourceEdits(
      f.c,
      f.job,
      new Map([[f.words[0].mediaId, f.words]]),
      f.durations,
      [],
    ),
  );
  const assembled = result as Awaited<ReturnType<typeof assembleSourceEdits>>;
  const q4 = assembled.chapters[3];
  assert.equal(q4.status, "failed");
  assert.equal(q4.sourceEdit, undefined);
  assert.equal(
    q4.error,
    "This chapter's saved answers could not be matched to its original recording. No automatic cut was made.",
  );
  for (const chapter of assembled.chapters.slice(0, 3)) {
    assert.equal(chapter.status, "preparing");
    assert.equal(chapter.error, undefined);
    assert.ok(chapter.sourceEdit!.clips.length >= 1);
    assert.equal(JSON.stringify(chapter).includes(q4.error!), false);
  }
  const logged = logs.join("\n");
  assert.match(logged, /film_answer_not_in_recording/);
  assert.match(logged, new RegExp(q4Turn.id));
  assert.equal(logged.includes("orchard"), false);
});

test("an unmatched middle chapter still uses the storyteller speech between its neighbors", async () => {
  const f = fixture();
  const q2Turn = f.c.interviews![0].turns.find((turn) => turn.chapterId === "q2")!;
  q2Turn.text =
    "The orchard was a very different place entirely yesterday afternoon";
  const assembled = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  const q2 = assembled.chapters[1];
  assert.equal(q2.status, "preparing");
  assert.equal(q2.error, undefined);
  assert.ok(q2.sourceEdit!.clips.length >= 1);
  assert.match(JSON.stringify(q2.sourceEdit!.clips), /patience/);
  for (const chapter of assembled.chapters.filter((item) => item.chapterId !== "q2")) {
    assert.equal(chapter.status, "preparing");
    assert.equal(chapter.error, undefined);
  }
});

test("a finished chapter keeps its saved film when a later match misses that chapter", async () => {
  const f = fixture();
  const playback = {
    schemaVersion: 1 as const,
    jobId: "film_saved",
    chapterId: "q1",
    mediaId: "playbackmedia_saved",
    sourceTakeIds: f.job.chapters[0].sourceTakeIds,
    sourceSha256: "source",
    planSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    durationMs: 4000,
    words: [{ text: "grandmother", startMs: 0, endMs: 400 }],
    createdAt: f.c.createdAt,
  };
  f.job.chapters[0] = {
    ...f.job.chapters[0],
    status: "ready",
    progress: 1,
    playback,
  };
  const q1Turn = f.c.interviews![0].turns.find((turn) => turn.chapterId === "q1")!;
  q1Turn.text = "This wording is absent from the transcript entirely";
  const assembled = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([[f.words[0].mediaId, f.words]]),
    f.durations,
    [],
  );
  assert.equal(assembled.chapters[0].status, "ready");
  assert.equal(assembled.chapters[0].playback, playback);
  assert.equal(assembled.chapters[0].error, undefined);
  assert.equal(assembled.chapters[1].status, "preparing");
});

test("a chapter retake made only of short answers is still cut", async () => {
  const f = fixture();
  const original = f.c.interviews![0];
  const previous = original.turns.find((turn) => turn.chapterId === "q4")!;
  original.excludedTurnIds.push(previous.id);
  const mediaId = "retake_media";
  const lines = ["Courage.", "Plant sunflowers nearby."];
  f.c.interviews!.push({
    id: "retake_session",
    provider: "elevenlabs",
    status: "completed",
    startedAt: f.c.createdAt,
    replacesChapterId: "q4",
    excludedTurnIds: [],
    segments: [
      {
        id: "retake_segment",
        mediaId,
        kind: "voice",
        startMs: 0,
        durationMs: 12000,
        createdAt: f.c.createdAt,
      },
    ],
    turns: lines.map((text, index) => ({
      id: `retake_${index}`,
      role: "user" as const,
      chapterId: "q4" as const,
      sequence: index,
      capturedAt: f.c.createdAt,
      timing: "unaligned" as const,
      text,
    })),
  });
  let tick = 0;
  const retakeWords: SourceWord[] = lines.flatMap((line) => {
    const words = line
      .replace(/[.]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((text) => {
        const word: SourceWord = {
          text,
          startMs: tick,
          endMs: tick + 200,
          mediaId,
          speakerId: "speaker_0",
          languageCode: "eng",
        };
        tick += 400;
        return word;
      });
    tick += 800;
    return words;
  });
  const result = await assembleSourceEdits(
    f.c,
    f.job,
    new Map([
      [f.words[0].mediaId, f.words],
      [mediaId, retakeWords],
    ]),
    new Map([...f.durations, [mediaId, 12000]]),
    [],
  );
  assert.equal(result.chapters[0].status, "preparing");
  assert.ok(result.chapters[0].sourceEdit!.clips.length > 0);
  const q4 = result.chapters[3];
  assert.equal(q4.status, "preparing");
  const caption = JSON.stringify(q4.sourceEdit!.clips);
  assert.match(caption, /Courage/);
  assert.match(caption, /sunflowers/);
  assert.equal(caption.includes("listen"), false);
});

import { recoverInterviewSourceWords } from "../src/lib/collection/interview-source-recovery";
import type { InterviewSession } from "../src/lib/collection/types";

test("a recovered short retake is cut once as the whole part", async () => {
  const f = fixture();
  const original = f.c.interviews![0];
  const previous = original.turns.find((turn) => turn.chapterId === "q4")!;
  original.excludedTurnIds.push(previous.id);
  const mediaId = "retake_media";
  const retakeWords: SourceWord[] =
    "I hope you carry courage and plant sunflowers wherever you settle"
      .split(" ")
      .map((text, index) => ({
        text,
        startMs: 1000 + index * 400,
        endMs: 1200 + index * 400,
        mediaId,
        speakerId: "speaker_0",
        languageCode: "eng",
      }));
  const retake: InterviewSession = {
    id: "retake_session",
    provider: "elevenlabs",
    status: "completed",
    startedAt: f.c.createdAt,
    replacesChapterId: "q4",
    excludedTurnIds: [],
    segments: [
      {
        id: "retake_segment",
        mediaId,
        kind: "voice",
        startMs: 0,
        durationMs: 12000,
        createdAt: f.c.createdAt,
      },
    ],
    // Their matched spans cover the sentence, but neither says most of it.
    turns: ["Courage.", "I hope settle."].map((text, index) => ({
      id: `retake_${index}`,
      role: "user" as const,
      chapterId: "q4" as const,
      sequence: index,
      capturedAt: f.c.createdAt,
      timing: "unaligned" as const,
      text,
    })),
  };
  retake.turns = recoverInterviewSourceWords(retake, [
    { segment: retake.segments[0], durationMs: 12000, words: retakeWords },
  ]);
  f.c.interviews!.push(retake);
  const { result } = await withMatchLogs(() =>
    assembleSourceEdits(
      f.c,
      f.job,
      new Map([
        [f.words[0].mediaId, f.words],
        [mediaId, retakeWords],
      ]),
      new Map([...f.durations, [mediaId, 12000]]),
      [],
    ),
  );
  const q4 = (result as Awaited<ReturnType<typeof assembleSourceEdits>>)
    .chapters[3];
  assert.equal(q4.status, "preparing");
  const clips = q4.sourceEdit!.clips;
  assert.equal(clips.length, 1);
  assert.equal(clips[0].mediaId, mediaId);
  assert.ok(clips[0].inMs <= retakeWords[0].startMs);
  assert.ok(clips[0].outMs >= retakeWords.at(-1)!.endMs);
  const caption = JSON.stringify(clips);
  assert.match(caption, /sunflowers/);
  assert.equal(caption.includes("listen"), false);
});

test("a short recovered retake is cut whole when a one-word fragment is its last word", async () => {
  const f = fixture();
  const original = f.c.interviews![0];
  const previous = original.turns.find((turn) => turn.chapterId === "q4")!;
  original.excludedTurnIds.push(previous.id);
  const mediaId = "retake_media";
  const retakeWords: SourceWord[] = ["Keep", "going", "bravely"].map(
    (text, index) => ({
      text,
      startMs: 1000 + index * 900,
      endMs: 1500 + index * 900,
      mediaId,
      speakerId: "speaker_0",
      languageCode: "eng",
    }),
  );
  const retake: InterviewSession = {
    id: "retake_session",
    provider: "elevenlabs",
    status: "completed",
    startedAt: f.c.createdAt,
    replacesChapterId: "q4",
    excludedTurnIds: [],
    segments: [
      {
        id: "retake_segment",
        mediaId,
        kind: "voice",
        startMs: 0,
        durationMs: 6000,
        createdAt: f.c.createdAt,
      },
    ],
    turns: ["Bravely.", "Keep going bravely."].map((text, index) => ({
      id: `retake_${index}`,
      role: "user" as const,
      chapterId: "q4" as const,
      sequence: index,
      capturedAt: f.c.createdAt,
      timing: "unaligned" as const,
      text,
    })),
  };
  retake.turns = recoverInterviewSourceWords(retake, [
    { segment: retake.segments[0], durationMs: 6000, words: retakeWords },
  ]);
  assert.equal(retake.turns.length, 3);
  f.c.interviews!.push(retake);
  const { result } = await withMatchLogs(() =>
    assembleSourceEdits(
      f.c,
      f.job,
      new Map([
        [f.words[0].mediaId, f.words],
        [mediaId, retakeWords],
      ]),
      new Map([...f.durations, [mediaId, 6000]]),
      [],
    ),
  );
  const q4 = (result as Awaited<ReturnType<typeof assembleSourceEdits>>)
    .chapters[3];
  assert.equal(q4.status, "preparing");
  const clips = q4.sourceEdit!.clips;
  assert.equal(clips.length, 1);
  assert.ok(
    clips[0].inMs <= retakeWords[0].startMs,
    "The cut starts before the first retake word.",
  );
  assert.ok(
    clips[0].outMs >= retakeWords.at(-1)!.endMs,
    "The cut ends after the last retake word.",
  );
  assert.deepEqual(
    clips[0].captions?.map((caption) => caption.text),
    ["Keep going bravely"],
  );
});

test("a short answer with no neighbor still stops outside a chapter retake", async () => {
  const f = fixture();
  const session = f.c.interviews![0];
  session.turns.forEach((turn, index) => {
    if (index === 0) turn.text = "Yes";
    else if (!session.excludedTurnIds.includes(turn.id))
      session.excludedTurnIds.push(turn.id);
  });
  await assert.rejects(
    () =>
      assembleSourceEdits(
        f.c,
        f.job,
        new Map([[f.words[0].mediaId, f.words]]),
        f.durations,
        [],
      ),
    /neighboring answer/,
  );
});
