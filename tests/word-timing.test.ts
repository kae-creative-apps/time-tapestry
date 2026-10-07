import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captionsForWords,
  cutsForMatchedWords,
  matchSourceWords,
  sessionWordTimeline,
  validateSourceWords,
  type SourceWord,
} from "../src/lib/collection/films/word-matching";
import { cleanSourcePassage } from "../src/lib/collection/films/source-cleanup";

const mediaId = "fictional_source";
const sourceWords = (text: string) =>
  text.split(" ").map((text, index): SourceWord => ({
    text,
    mediaId,
    speakerId: "speaker_0",
    startMs: index * 100 + 10,
    endMs: index * 100 + 90,
  }));
const untimed = (words: SourceWord[], index: number) => {
  words[index].endMs = words[index].startMs;
};

test("untimed source tokens remain unchanged without blocking a separate timed answer", () => {
  const words = sourceWords(
    "welcome hello I remember blue bicycle goodbye thanks now",
  );
  untimed(words, 0);
  untimed(words, 8);
  const original = structuredClone(words);
  assert.equal(validateSourceWords(words, 1000, mediaId), words);
  const match = matchSourceWords("I remember blue bicycle", words);
  assert.deepEqual(match.words, words.slice(2, 6));
  const clips = cutsForMatchedWords(
    match.words,
    words,
    new Map([[mediaId, 1000]]),
  );
  assert.equal(clips.length, 1);
  assert.equal(clips[0].inMs, words[1].endMs);
  assert.equal(clips[0].outMs, words[6].startMs);
  assert.equal(clips[0].captions![0].text, "I remember blue bicycle");
  assert.deepEqual(words, original, "no words, times or speaker labels change");
});

test("an untimed answer token is skipped and timed words still authorize the passage", () => {
  const sentence = "I remember blue bicycle";
  const parts = sentence.split(" ");
  for (const index of [0, 1, 3]) {
    const words = sourceWords(sentence);
    untimed(words, index);
    const original = structuredClone(words);
    validateSourceWords(words, 1000, mediaId);
    const match = matchSourceWords(sentence, words);
    assert.deepEqual(
      match.words.map((word) => word.text),
      parts.filter((_, wordIndex) => wordIndex !== index),
    );
    assert.ok(match.words.every((word) => word.endMs > word.startMs));
    const clips = cutsForMatchedWords(
      match.words,
      words,
      new Map([[mediaId, 1000]]),
    );
    assert.equal(clips.length, 1);
    assert.ok(clips[0].outMs > clips[0].inMs);
    assert.equal(words[index].endMs, words[index].startMs);
    assert.deepEqual(words, original);
  }
});

test("an unmatched interior untimed token is skipped without a fabricated duration", () => {
  const words = sourceWords(
    "I remember the blue bicycle extra beside the kitchen window daily",
  );
  untimed(words, 5);
  const original = structuredClone(words);
  validateSourceWords(words, 2000, mediaId);
  const match = matchSourceWords(
    "I remember the blue bicycle beside the kitchen window daily",
    words,
  );
  assert.equal(
    match.words.map((word) => word.text).join(" "),
    "I remember the blue bicycle beside the kitchen window daily",
  );
  assert.ok(match.words.every((word) => word.endMs > word.startMs));
  assert.equal(words[5].endMs, words[5].startMs);
  assert.deepEqual(words, original);
});

test("an untimed cross-file edge is skipped and the timed answer still matches", () => {
  const text =
    "I remember how we walked along the garden path together before the summer rain began and shared every story afterward";
  const query = text.split(" ");
  assert.equal(query.length, 20);
  const first = sourceWords([...query.slice(0, 10), "extra", "yes"].join(" "));
  const second = sourceWords(query.slice(10).join(" ")).map((word) => ({
    ...word,
    mediaId: "second_source",
  }));
  const originalEdge = structuredClone(first[first.length - 1]);
  untimed(first, first.length - 1);
  validateSourceWords(first, 2000, mediaId);
  validateSourceWords(second, 2000, "second_source");
  const match = matchSourceWords(text, [...first, ...second]);
  assert.equal(match.words.length, query.length);
  assert.ok(match.words.every((word) => word.endMs > word.startMs));
  assert.equal(first.at(-1)!.endMs, first.at(-1)!.startMs);
  assert.equal(first.at(-1)!.text, originalEdge.text);
});

test("an untimed neighbor is skipped and the nearest timed word bounds the cut", () => {
  const sentence = "welcome hello I remember blue bicycle goodbye thanks now";
  const duration = new Map([[mediaId, 1000]]);
  const left = sourceWords(sentence);
  untimed(left, 1);
  const leftOriginal = structuredClone(left);
  validateSourceWords(left, 1000, mediaId);
  const leftMatch = matchSourceWords("I remember blue bicycle", left);
  const leftClip = cutsForMatchedWords(leftMatch.words, left, duration)[0];
  assert.equal(leftClip.inMs, left[0].endMs);
  assert.equal(leftClip.outMs, left[6].startMs);
  assert.deepEqual(left, leftOriginal);
  const right = sourceWords(sentence);
  untimed(right, 6);
  const rightOriginal = structuredClone(right);
  validateSourceWords(right, 1000, mediaId);
  const rightMatch = matchSourceWords("I remember blue bicycle", right);
  const rightClip = cutsForMatchedWords(rightMatch.words, right, duration)[0];
  assert.equal(rightClip.inMs, right[1].endMs);
  assert.equal(rightClip.outMs, right[7].startMs);
  assert.equal(right[6].endMs, right[6].startMs);
  assert.deepEqual(right, rightOriginal);
});

test("caption, cut and cleanup entry points independently refuse a selected untimed token", () => {
  const words = sourceWords("I remember blue bicycle");
  const clip = {
    mediaId,
    inMs: 0,
    outMs: 1000,
    captions: captionsForWords(words),
  };
  untimed(words, 1);
  const original = structuredClone({ words, clip });
  for (const attempt of [
    () => captionsForWords(words),
    () => cutsForMatchedWords(words, words, new Map([[mediaId, 1000]])),
    () => cleanSourcePassage(clip, words),
  ])
    assert.throws(attempt, /selected source word.*positive duration/);
  assert.deepEqual({ words, clip }, original);
});

test("a continuous cut skips an untimed interior word and keeps timed bounds", () => {
  const words = sourceWords("alpha untimed beta");
  untimed(words, 1);
  const original = structuredClone(words);
  validateSourceWords(words, 1000, mediaId);
  const clips = cutsForMatchedWords(
    [words[0], words[2]],
    words,
    new Map([[mediaId, 1000]]),
  );
  assert.equal(clips.length, 1);
  assert.equal(clips[0].inMs, Math.max(0, words[0].startMs - 140));
  assert.equal(clips[0].outMs, Math.min(1000, words[2].endMs + 180));
  assert.equal(clips[0].captions![0].text, "alpha beta");
  assert.equal(words[1].endMs, words[1].startMs);
  assert.deepEqual(words, original);
});

test("source search still rejects every actual invalid bound or source identity", () => {
  const invalid = [
    { index: 0, patch: { startMs: -1 } },
    { index: 0, patch: { endMs: 9 } },
    { index: 1, patch: { startMs: 9 } },
    { index: 0, patch: { startMs: NaN } },
    { index: 0, patch: { endMs: Infinity } },
    { index: 0, patch: { mediaId: "foreign_source" } },
    { index: 0, patch: { text: " " } },
    { index: 1, patch: { endMs: 201 } },
    { index: 1, patch: { startMs: 201, endMs: 201 } },
  ];
  for (const { index, patch } of invalid) {
    const words = sourceWords("hello there");
    Object.assign(words[index], patch);
    assert.throws(
      () => validateSourceWords(words, 200, mediaId),
      /timestamps outside/,
    );
  }
  for (const duration of [NaN, Infinity, 0, -1])
    assert.throws(
      () => validateSourceWords(sourceWords("hello there"), duration, mediaId),
      /measured positive duration/,
    );
});

test("positive overlapping word spans remain supported with complete caption bounds", () => {
  const words = sourceWords("I remember blue bicycle");
  words[1].startMs = 80;
  validateSourceWords(words, 1000, mediaId);
  const match = matchSourceWords("I remember blue bicycle", words);
  const clips = cutsForMatchedWords(words, words, new Map([[mediaId, 1000]]));
  assert.deepEqual(match.words, words);
  assert.equal(clips[0].captions![0].endMs, words[3].endMs);
});

test("untimed tokens cannot serve as evidence for deleting a rollover duplicate", () => {
  const first = sourceWords("hello there").map((word) => ({
    ...word,
    mediaId: "first",
    startMs: word.startMs + 500,
    endMs: word.endMs + 500,
  }));
  const second = sourceWords("hello there").map((word) => ({
    ...word,
    mediaId: "second",
  }));
  untimed(first, 1);
  untimed(second, 1);
  const result = sessionWordTimeline(
    [
      { mediaId: "first", startMs: 0 },
      { mediaId: "second", startMs: 500 },
    ],
    new Map([
      ["first", first],
      ["second", second],
    ]),
    new Map([
      ["first", 1000],
      ["second", 1000],
    ]),
  );
  assert.deepEqual(result.allWords, [...first, ...second]);
  assert.deepEqual(result.matchableWords, [...first, ...second]);
});
