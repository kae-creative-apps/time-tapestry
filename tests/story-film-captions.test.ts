import assert from "node:assert/strict";
import { test } from "node:test";
import {
  narrationCaptionAt,
  narrationCaptionPages,
} from "../src/lib/story-film-captions";
import type { FilmWord } from "../src/lib/collection/films/types";

function spoken(text: string, startMs = 1000): FilmWord[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startMs: startMs + index * 100,
    endMs: startMs + (index + 1) * 100,
  }));
}

test("captions are absent before and after narration, including empty input", () => {
  const words = spoken("A remembered story.");
  const pages = narrationCaptionPages(words);
  assert.equal(narrationCaptionAt(pages, 999), "");
  assert.equal(narrationCaptionAt(pages, 1000), "A remembered story.");
  assert.equal(narrationCaptionAt(pages, 1299), "A remembered story.");
  assert.equal(narrationCaptionAt(pages, 1300), "");
  assert.equal(narrationCaptionAt(pages, 10000), "");
  assert.deepEqual(narrationCaptionPages([]), []);
  assert.equal(narrationCaptionAt([], 1000), "");
  assert.equal(narrationCaptionAt([[]], 1000), "");
});

test("pauses longer than 900 ms clear captions until the next spoken word", () => {
  const words: FilmWord[] = [
    { text: "Listen.", startMs: 100, endMs: 400 },
    { text: "Again.", startMs: 1301, endMs: 1601 },
  ];
  const pages = narrationCaptionPages(words);
  assert.equal(pages.length, 2);
  assert.equal(narrationCaptionAt(pages, 399), "Listen.");
  for (const time of [400, 800, 1300])
    assert.equal(narrationCaptionAt(pages, time), "");
  assert.equal(narrationCaptionAt(pages, 1301), "Again.");
  assert.equal(narrationCaptionAt(pages, 1601), "");
  // A pause exactly at the threshold remains one phrase.
  assert.equal(
    narrationCaptionPages([words[0], { ...words[1], startMs: 1300 }]).length,
    1,
  );
});

test("caption pagination keeps phrases within the display budget without losing words", () => {
  const words = spoken(
    "We remember that small garden. Every morning the neighbors stopped beside the gate and told us what had changed. Some stories were quiet, and some stories were joyful. We listened, we listened again, and we remembered every name.",
  );
  const original = structuredClone(words);
  const pages = narrationCaptionPages(words);
  assert.ok(pages.length > 2);
  assert.ok(
    pages.every(
      (page) =>
        page.length > 0 && page.map((word) => word.text).join(" ").length <= 74,
    ),
  );
  assert.deepEqual(pages.flat(), words);
  assert.deepEqual(
    words,
    original,
    "pagination must preserve source timing and text",
  );
  assert.equal(
    pages[0].map((word) => word.text).join(" "),
    "We remember that small garden.",
  );
});

test("a full caption page ends at the exact boundary where the next page begins", () => {
  const pages = narrationCaptionPages(
    spoken("We remember that small garden. It still feels like home."),
  );
  assert.equal(pages.length, 2);
  assert.equal(
    narrationCaptionAt(pages, 1499),
    "We remember that small garden.",
  );
  assert.equal(narrationCaptionAt(pages, 1500), "It still feels like home.");
  assert.equal(narrationCaptionAt(pages, 1999), "It still feels like home.");
  assert.equal(narrationCaptionAt(pages, 2000), "");
});

test("the 74-character boundary fits exactly and the following word moves intact", () => {
  const first = "a".repeat(36);
  const second = "b".repeat(37);
  const words = spoken(`${first} ${second} next`);
  const pages = narrationCaptionPages(words);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].map((word) => word.text).join(" ").length, 74);
  assert.deepEqual(pages[1], [words[2]]);
  assert.deepEqual(pages.flat(), words);
  assert.equal(narrationCaptionAt(pages, 1200), "next");
});
