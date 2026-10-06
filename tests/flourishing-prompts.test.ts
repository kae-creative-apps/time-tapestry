import assert from "node:assert/strict";
import test from "node:test";
import { FLOURISHING_CATEGORIES, FLOURISHING_PROMPTS, flourishingPrompt } from "../src/lib/collection/flourishing-prompts";

test("the living-story library has 100 distinct prompts across all seven dimensions", () => {
  assert.equal(FLOURISHING_PROMPTS.length, 100);
  assert.equal(new Set(FLOURISHING_PROMPTS.map(p => p.id)).size, 100);
  assert.equal(new Set(FLOURISHING_PROMPTS.map(p => p.question)).size, 100);
  assert.equal(FLOURISHING_CATEGORIES.length, 7);
  for (const category of FLOURISHING_CATEGORIES) {
    const items = FLOURISHING_PROMPTS.filter(p => p.category === category.id);
    assert.ok(items.length >= 14);
    for (const p of items) {
      assert.equal(flourishingPrompt(p.id), p);
      assert.ok(p.question.length <= 180, p.id);
      assert.ok(p.title.length <= 45, p.id);
      assert.ok(!p.question.includes("\u2014"));
    }
  }
  assert.equal(flourishingPrompt("not-a-prompt"), undefined);
});
