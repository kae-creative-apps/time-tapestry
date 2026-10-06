import assert from "node:assert/strict";
import test from "node:test";
import { mergePostcardDrafts, postcardDraftsEqual } from "./postcard-drafts";

test("proof refresh preserves a dirty encouragement and refreshes untouched cards", () => {
  assert.deepEqual(
    mergePostcardDrafts(
      { q1: "Still typing", q2: "Old" },
      { q1: "Saved", q2: "Old" },
      { q1: "Saved", q2: "New" },
    ),
    { q1: "Still typing", q2: "New" },
  );
});

test("save acknowledgement normalizes saved words without erasing subsequent typing", () => {
  assert.deepEqual(
    mergePostcardDrafts(
      { q1: "Second thought", q2: " Kindness " },
      { q1: "First thought", q2: " Kindness " },
      { q1: "First thought", q2: "Kindness" },
    ),
    { q1: "Second thought", q2: "Kindness" },
  );
  assert.equal(
    postcardDraftsEqual({ q2: "b", q1: "a" }, { q1: "a", q2: "b" }),
    true,
  );
  assert.equal(postcardDraftsEqual({ q1: "a" }, { q1: "a", q2: "b" }), false);
});
