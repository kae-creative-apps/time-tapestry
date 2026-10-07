import assert from "node:assert/strict";
import test from "node:test";
import { cleanStoryBookText } from "../src/lib/collection/story-book-reading";

test("book reading removes spoken noise and keeps the storyteller's words", () => {
  assert.equal(
    cleanStoryBookText(
      "Um... So it just w- felt encouraging.\n\nHmm.\n\nYeah. I'm, I'm grateful. The lesson was, like, stay curious, you know, and keep going.",
    ),
    "It just felt encouraging. I'm grateful. The lesson was, stay curious, and keep going.",
  );
  assert.equal(
    cleanStoryBookText("It was like 100 bucks. I like to help."),
    "It was like 100 bucks. I like to help.",
  );
  assert.equal(
    cleanStoryBookText(
      "The lesson was don't do drugs, and... There's more life.",
    ),
    "The lesson was don't do drugs. There's more life.",
  );
  assert.equal(
    cleanStoryBookText('She said, "Um, I am not sure." That mattered.'),
    'She said, "Um, I am not sure." That mattered.',
  );
});

test("a shaped chapter keeps short answers and only loses leftover fillers", () => {
  const shaped = "Yes.\n\nI like the garden. Um, it grew.";
  assert.equal(
    cleanStoryBookText(shaped, true),
    "Yes.\n\nI like the garden. It grew.",
  );
});

test("false starts and asides become one flowing story", () => {
  assert.equal(
    cleanStoryBookText(
      "Snappy. What? Snappy. What the... oh, when somebody paid for our meal on our honeymoon and it was like 100 bucks.\n\nSuper kind.\n\nwe were shocked and we didn't expect it because we didn't know him.",
    ),
    "When somebody paid for our meal on our honeymoon and it was like 100 bucks. We were shocked and we didn't expect it because we didn't know him.",
  );
});

test("cleanup never replaces a chapter with an empty page", () => {
  assert.equal(cleanStoryBookText("Um..."), "Um...");
  assert.equal(cleanStoryBookText("Hmm.\n\nYeah."), "Hmm.\n\nYeah.");
});
