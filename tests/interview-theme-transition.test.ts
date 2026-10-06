import assert from "node:assert/strict";
import test from "node:test";
import { canChangeInterviewTheme } from "../src/lib/collection/interview-theme-transition";

test("question detection and theme tools require spoken evidence or an explicit skip", () => {
  assert.equal(canChangeInterviewTheme("q1", "q2", new Set(), null), false);
  assert.equal(
    canChangeInterviewTheme("q1", "q2", new Set(["q1"]), null),
    true,
  );
  assert.equal(canChangeInterviewTheme("q1", "q2", new Set(), "q2"), true);
  assert.equal(canChangeInterviewTheme("q1", "q3", new Set(), "q2"), false);
  assert.equal(canChangeInterviewTheme("q1", "q1", new Set(), null), true);
});

test("a scoped replacement cannot leave its chapter even with an answer or skip", () => {
  assert.equal(
    canChangeInterviewTheme("q3", "q4", new Set(["q3"]), "q4", "q3"),
    false,
  );
  assert.equal(
    canChangeInterviewTheme("q3", "q3", new Set(), null, "q3"),
    true,
  );
});
