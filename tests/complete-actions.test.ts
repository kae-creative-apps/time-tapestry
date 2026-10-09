import assert from "node:assert/strict";
import test from "node:test";
import {
  completePageAction,
  shouldLeaveRecordingForComplete,
} from "../src/lib/collection/complete-actions";

const hrefs = {
  recordHref: "/record/collection",
  reviewHref: "/collection/collection/review",
};

test("a failed preparation has one try-again action and waiting has none", () => {
  assert.deepEqual(
    completePageAction({
      loading: false,
      ready: false,
      accepted: true,
      needsAttention: true,
      canRetry: true,
      canUseFullInterview: false,
      preparationStatus: "needs_attention",
      ...hrefs,
    }),
    { kind: "retry", label: "Try again" },
  );
  assert.equal(
    completePageAction({
      loading: false,
      ready: false,
      accepted: true,
      needsAttention: false,
      canRetry: false,
      canUseFullInterview: false,
      preparationStatus: "queued",
      ...hrefs,
    }).kind,
    "status",
  );
  const waiting = completePageAction({
    loading: false,
    ready: false,
    accepted: true,
    needsAttention: false,
    canRetry: false,
    canUseFullInterview: false,
    preparationStatus: "preparing",
    ...hrefs,
  });
  assert.equal(waiting.kind, "status");
  assert.equal(
    JSON.stringify(waiting).includes("Check preparation"),
    false,
  );
});

test("continue stays available only when another answer is required or nothing is submitted", () => {
  assert.equal(
    completePageAction({
      loading: false,
      ready: false,
      accepted: true,
      needsAttention: true,
      canRetry: true,
      canUseFullInterview: false,
      missingAreaId: "q2",
      preparationStatus: "needs_attention",
      ...hrefs,
    }).kind,
    "link",
  );
  assert.equal(
    completePageAction({
      loading: false,
      ready: false,
      accepted: false,
      needsAttention: false,
      canRetry: false,
      canUseFullInterview: false,
      ...hrefs,
    }).kind,
    "link",
  );
});

test("a blocked film retry offers see your stories instead of try again", () => {
  assert.deepEqual(
    completePageAction({
      loading: false,
      ready: false,
      accepted: true,
      needsAttention: true,
      canRetry: false,
      canUseFullInterview: false,
      preparationStatus: "needs_attention",
      ...hrefs,
    }),
    { kind: "link", label: "See your stories", href: hrefs.reviewHref },
  );
});

test("needs attention does not send the storyteller back to the complete page", () => {
  const base = {
    role: "owner",
    status: "recording",
    preparation: { status: "needs_attention", missingAreas: [] },
    phase: "ready",
  };
  assert.equal(shouldLeaveRecordingForComplete(base), false);
  assert.equal(
    shouldLeaveRecordingForComplete({
      ...base,
      preparation: { status: "queued", missingAreas: [] },
    }),
    true,
  );
  assert.equal(
    shouldLeaveRecordingForComplete({
      ...base,
      preparation: { status: "queued", missingAreas: [{ id: "q1" }] },
    }),
    false,
  );
});
