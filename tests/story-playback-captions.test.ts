import assert from "node:assert/strict";
import test from "node:test";
import {
  playbackClock,
  playbackPhrases,
  phraseAtTime,
} from "../src/components/collection/story-playback-captions";

const word = (text: string, startMs: number, endMs = startMs + 300) => ({
  text,
  startMs,
  endMs,
});

test("spoken phrases keep exact source words and break at a sentence or long pause", () => {
  const words = [
    word("We", 0),
    word("were", 350),
    word("there.", 700),
    word("Then", 1500),
    word("together", 1850),
    word("again", 3100),
  ];
  const phrases = playbackPhrases(words);
  assert.deepEqual(
    phrases.map((phrase) => phrase.words.map((item) => item.text)),
    [["We", "were", "there."], ["Then", "together"], ["again"]],
  );
  assert.deepEqual(
    phrases.flatMap((phrase) => phrase.words),
    words,
  );
});

test("playback time drives captions on pause and backward seeking without anticipating words", () => {
  const phrases = playbackPhrases([
    word("First", 0),
    word("phrase", 350),
    word("Next", 2000),
  ]);
  assert.equal(phraseAtTime(phrases, 1800), phrases[0]);
  assert.equal(phraseAtTime(phrases, 2000), phrases[1]);
  assert.equal(phraseAtTime(phrases, 10), phrases[0]);
  assert.equal(phraseAtTime(phrases, 999999), phrases[1]);
  assert.equal(phraseAtTime([], 0), undefined);
});

test("long uninterrupted speech stays in short captions without dropping words", () => {
  const words = Array.from({ length: 19 }, (_, index) =>
    word(`word${index}`, index * 350),
  );
  const phrases = playbackPhrases(words);
  assert.deepEqual(
    phrases.map((phrase) => phrase.words.length),
    [8, 8, 3],
  );
  assert.deepEqual(
    phrases.flatMap((phrase) => phrase.words),
    words,
  );
});

test("invalid timing and blank text do not enter the animated captions", () => {
  const words = [
    word("", 0),
    word("bad", -1),
    word("bad", NaN),
    word("bad", 100, 1),
    word("kept", 200),
  ];
  assert.deepEqual(
    playbackPhrases(words).flatMap((phrase) => phrase.words),
    [words[4]],
  );
});

test("the seek clock handles metadata gaps and hour-long recordings", () => {
  assert.equal(playbackClock(0), "0:00");
  assert.equal(playbackClock(65.9), "1:05");
  assert.equal(playbackClock(3601), "60:01");
  assert.equal(playbackClock(-1), "0:00");
  assert.equal(playbackClock(Infinity), "0:00");
});
