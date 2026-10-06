import assert from "node:assert/strict";
import test from "node:test";
import { rememberReviewLocation, reviewLocation } from "./review-navigation";

test("review history returns to the saved step and chapter after back or reload", () => {
  const location = {
    pathname: "/collection/fictional/review",
    search: "?key=existing-owner-grant",
    hash: "",
  };
  const entries: string[] = [];
  const state = { existingRouterState: true };
  const history = {
    state,
    pushState(actual: unknown, _title: string, url?: string | URL | null) {
      assert.equal(actual, state, "preserve the app router history state");
      entries.push(String(url));
      location.hash = new URL(String(url), "https://example.invalid").hash;
    },
  };
  rememberReviewLocation(location, history, { step: 0, chapterId: "q3" });
  rememberReviewLocation(location, history, { step: 1, chapterId: "q3" });
  rememberReviewLocation(location, history, { step: 1, chapterId: "q3" });
  assert.equal(
    entries.length,
    2,
    "same-step clicks do not fill browser history",
  );
  assert.deepEqual(reviewLocation(location.hash), { step: 1, chapterId: "q1" });
  const back = new URL(entries[0], "https://example.invalid");
  assert.deepEqual(reviewLocation(back.hash), { step: 0, chapterId: "q3" });
  assert.equal(
    back.search,
    location.search,
    "existing authorization query stays unchanged",
  );
});

test("page anchors and unrecognized fragments do not reset the current review or steal skip-link focus", () => {
  for (const hash of [
    "#story-content",
    "#review/chapter/q5",
    "#review/chapter/%3Cscript%3E",
    "#anything",
  ])
    assert.equal(reviewLocation(hash), null);
  assert.deepEqual(reviewLocation(""), { step: 0, chapterId: "q1" });
  assert.deepEqual(reviewLocation("#review/approve"), {
    step: 2,
    chapterId: "q1",
  });
});
