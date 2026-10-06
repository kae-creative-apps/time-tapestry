import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanSourcePassage } from "../src/lib/collection/films/source-cleanup";
import {
  detectSourceSilence,
  parseSourceSilence,
} from "../src/lib/collection/films/source-silence";
import {
  captionsForWords,
  type SourceWord,
} from "../src/lib/collection/films/word-matching";

function fixture(text: string) {
  const words = text.split(" ").map((text, index): SourceWord => ({
    mediaId: "source_123",
    text,
    startMs: 200 + index * 600,
    endMs: 400 + index * 600,
    speakerId: "storyteller",
  }));
  const clip = {
    mediaId: "source_123",
    inMs: 0,
    outMs: words.at(-1)!.endMs + 500,
    captions: captionsForWords(words),
  };
  return { words, clip };
}
const captionText = (result: ReturnType<typeof cleanSourcePassage>) =>
  result.clips
    .flatMap((clip) => clip.captions ?? [])
    .map((caption) => caption.text)
    .join(" ");

test("isolated timestamped fillers create real retained source ranges, with safe fades and retained captions", () => {
  for (const filler of ["um,", "UMMM...", "uh;", "erm,"]) {
    const { words, clip } = fixture(
      `I remember the ${filler} blue notebook beside our window.`,
    );
    const original = structuredClone({ words, clip });
    const result = cleanSourcePassage(clip, words);
    assert.equal(result.clips.length, 2);
    assert.equal(result.removed.length, 1);
    const removed = result.removed[0];
    assert.equal(removed.reason, "filler");
    assert.ok(
      removed.inMs <= words[3].startMs && removed.outMs >= words[3].endMs,
    );
    assert.ok(removed.inMs - words[2].endMs >= 90);
    assert.ok(words[4].startMs - removed.outMs >= 90);
    assert.ok(
      Math.abs(
        (removed.inMs * 30) / 1000 - Math.round((removed.inMs * 30) / 1000),
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        (removed.outMs * 30) / 1000 - Math.round((removed.outMs * 30) / 1000),
      ) < 1e-8,
    );
    assert.equal(
      captionText(result),
      "I remember the blue notebook beside our window.",
    );
    for (const output of result.clips) {
      assert.ok(
        output.captions!.every(
          (caption) =>
            caption.startMs >= output.inMs && caption.endMs <= output.outMs,
        ),
      );
      assert.ok(
        (output.audioFadeInMs ?? 0) <= 15 && (output.audioFadeOutMs ?? 0) <= 15,
      );
    }
    assert.deepEqual(
      { words, clip },
      original,
      "source transcript and original range are immutable",
    );
  }
});

test("meaningful responses, language, repetition and quoted or reported fillers stay intact", () => {
  for (const sentence of [
    "I like the blue notebook you know so well.",
    "I remember hmm the blue notebook beside our window.",
    "I remember uh-huh the blue notebook beside our window.",
    "I remember the blue blue notebook beside our window.",
    'I remember the "um" written beside our window.',
    "I remember she said um before leaving our home.",
    "I remember um was the word he used that day.",
    "I remember the um um blue notebook beside our window.",
    "I remember the blue notebook beside our window um",
    "Um, yes",
  ]) {
    const { clip, words } = fixture(sentence);
    assert.deepEqual(
      cleanSourcePassage(clip, words),
      { clips: [clip], removed: [] },
      sentence,
    );
  }
});

test("uncertain or overlapping boundaries cannot remove any part of a spoken word", () => {
  const f = fixture("I remember the um blue notebook beside our window.");
  const cases = [
    f.words.map((word, i) =>
      i === 3 ? { ...word, startMs: f.words[2].endMs + 10 } : word,
    ),
    f.words.map((word, i) =>
      i === 3 ? { ...word, endMs: f.words[4].startMs - 10 } : word,
    ),
    f.words.map((word, i) =>
      i === 3 ? { ...word, startMs: f.words[2].endMs - 1 } : word,
    ),
    f.words.map((word, i) => (i === 3 ? { ...word, endMs: NaN } : word)),
    f.words.map((word, i) =>
      i === 3 ? { ...word, speakerId: "someone_else" } : word,
    ),
  ];
  for (const words of cases)
    assert.deepEqual(cleanSourcePassage(f.clip, words), {
      clips: [f.clip],
      removed: [],
    });
});

test("long transcript gaps need measured silence and retain breathing room", () => {
  const { clip, words } = fixture(
    "I remember the blue notebook beside our window.",
  );
  words.slice(4).forEach((word) => {
    word.startMs += 3000;
    word.endMs += 3000;
  });
  clip.outMs += 3000;
  clip.captions = captionsForWords(words);
  assert.equal(
    cleanSourcePassage(clip, words).clips.length,
    1,
    "missing waveform evidence cannot authorize a cut",
  );
  const silence = { inMs: words[3].endMs + 100, outMs: words[4].startMs - 100 };
  const result = cleanSourcePassage(clip, words, [silence]);
  assert.equal(result.clips.length, 2);
  assert.equal(result.removed[0].reason, "silence");
  const retainedQuiet =
    silence.outMs -
    silence.inMs -
    (result.removed[0].outMs - result.removed[0].inMs);
  assert.ok(retainedQuiet >= 700 && retainedQuiet < 767);
  assert.equal(captionText(result), words.map((word) => word.text).join(" "));
  for (const length of [1499, 1500, 1501]) {
    assert.equal(
      cleanSourcePassage(clip, words, [
        { inMs: silence.inMs, outMs: silence.inMs + length },
      ]).clips.length,
      length > 1500 ? 2 : 1,
    );
  }
  assert.equal(
    cleanSourcePassage(clip, words, [
      { inMs: words[3].startMs, outMs: words[4].endMs },
    ]).clips.length,
    1,
    "speech inside silence evidence invalidates the cut",
  );
  assert.equal(
    cleanSourcePassage(clip, words, [silence, silence]).clips.length,
    1,
    "contradictory overlapping evidence fails safe",
  );
});

test("silence parser accepts ordered complete intervals and rejects invalid evidence", () => {
  assert.deepEqual(
    parseSourceSilence(
      "silence_start: 1.25\nsilence_end: 3.75 | silence_duration: 2.5",
      5000,
    ),
    [{ inMs: 1250, outMs: 3750 }],
  );
  for (const output of [
    "silence_start: 1",
    "silence_end: 3",
    "silence_start: -1\nsilence_end: 3",
    "silence_start: 1\nsilence_end: 6",
    "silence_start: 1\nsilence_start: 2\nsilence_end: 3",
  ]) {
    assert.deepEqual(parseSourceSilence(output, 5000), []);
  }
});

function wave(quietGap: boolean) {
  const rate = 16000,
    seconds = 5,
    samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const inGap = i >= rate && i < rate * 4;
    const level = inGap && quietGap ? 0 : 8000;
    buffer.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / rate) * level),
      44 + i * 2,
    );
  }
  return buffer;
}

test("actual waveform analysis distinguishes a quiet pause from audible sound without modifying the source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "source-silence-"));
  try {
    for (const quiet of [true, false]) {
      const file = path.join(root, `${quiet ? "quiet" : "sound"}.wav`);
      const original = wave(quiet);
      await writeFile(file, original);
      const result = await detectSourceSilence(file, 5000);
      if (quiet) {
        assert.equal(result.length, 1);
        assert.ok(Math.abs(result[0].inMs - 1000) < 2);
        assert.ok(Math.abs(result[0].outMs - 4000) < 2);
      } else assert.deepEqual(result, []);
      assert.deepEqual(await readFile(file), original);
    }
    assert.deepEqual(
      await detectSourceSilence(path.join(root, "missing.wav"), 5000),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
