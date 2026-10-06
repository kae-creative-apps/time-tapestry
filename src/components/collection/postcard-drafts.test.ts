import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePostcardDrafts,
  postcardDraftsEqual,
  postcardDraftProblems,
  postcardProblemSummary,
  restorePostcardWords,
} from "./postcard-drafts";

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

test("an empty card can be found and restored without losing another card's unsaved encouragement", () => {
  const messages = {
    q1: "  ",
    q2: "Still writing this thought",
    q3: "Hope",
    q4: "Love",
  };
  const saved = {
    q1: "Be kind",
    q2: "Previous thought",
    q3: "Hope",
    q4: "Love",
  };
  const ids = ["q1", "q2", "q3", "q4"];
  assert.deepEqual(
    postcardDraftProblems(messages, ids, 240).map((item) => item.id),
    ["q1"],
  );
  assert.equal(
    postcardProblemSummary(postcardDraftProblems(messages, ids, 240), ids),
    "Check card 1 before saving your postcard words.",
  );
  const recovered = restorePostcardWords(messages, saved, "q1");
  assert.equal(recovered.q1, "Be kind");
  assert.equal(recovered.q2, "Still writing this thought");
  assert.equal(
    postcardDraftsEqual(recovered, saved),
    false,
    "the other edit still needs saving",
  );
  assert.deepEqual(postcardDraftProblems(recovered, ids, 240), []);
  assert.equal(
    messages.q1,
    "  ",
    "restoration does not mutate a captured save snapshot",
  );
});

test("missing and overlong cards are reported even when the active card is valid", () => {
  const issues = postcardDraftProblems(
    { q1: "Ready", q2: "x".repeat(241) },
    ["q1", "q2", "q3"],
    240,
  );
  assert.deepEqual(
    issues.map((item) => item.id),
    ["q2", "q3"],
  );
  assert.match(issues[0].message, /240/);
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
