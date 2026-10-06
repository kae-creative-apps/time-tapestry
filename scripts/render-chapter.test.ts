import assert from "node:assert/strict";
import test from "node:test";
import {
  chapterDurationFrames,
  validateVideoPlan,
} from "../src/lib/video-plan";
import example from "../video/examples/text-preview.json";

const textPlan = () => structuredClone(example);
test("drafts render for review but cannot masquerade as approved edits", () => {
  assert.equal(
    chapterDurationFrames(
      validateVideoPlan(textPlan(), { requireApproval: false }),
    ),
    510,
  );
  assert.throws(() => validateVideoPlan(textPlan()), /approval/i);
});
test("one-hour limit includes the title and closer", () => {
  const plan = textPlan();
  plan.clips[0].outMs = 3593000;
  assert.equal(
    chapterDurationFrames(validateVideoPlan(plan, { requireApproval: false })),
    108000,
  );
  plan.clips[0].outMs = 3593001;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /one hour/,
  );
});
const mediaPlan = () => ({
  ...textPlan(),
  sources: [
    {
      assetId: "asset-1",
      sourceAnswerId: "answer-1",
      takeId: "take-1",
      acceptedTakeId: "take-1",
      kind: "video",
      relativePath: "interview.mp4",
      sha256: "a".repeat(64),
      durationMs: 10000,
      archiveRef: "private:original-1",
      originalPreserved: true,
    },
  ],
  clips: [
    {
      id: "clip-1",
      sourceAssetId: "asset-1",
      sourceAnswerId: "answer-1",
      kind: "video",
      inMs: 1000,
      outMs: 4000,
      captions: [
        {
          text: "A complete thought.",
          startMs: 1000,
          endMs: 4000,
          timestampMs: null,
          confidence: null,
        },
      ],
      editorialReason: "Selected a complete answer.",
    },
  ],
});
test("clip must reference the accepted original answer and take", () => {
  const plan = mediaPlan();
  validateVideoPlan(plan, { requireApproval: false });
  plan.sources[0].acceptedTakeId = "take-2";
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /accepted take/,
  );
});
test("rejects media path traversal and changed answer identity", () => {
  const plan = mediaPlan();
  plan.sources[0].relativePath = "../private.mp4";
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /safe relative path/,
  );
  plan.sources[0].relativePath = "interview.mp4";
  plan.clips[0].sourceAnswerId = "another-person";
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /does not match/,
  );
});
test("captions cannot drift outside an accepted edit", () => {
  const plan = mediaPlan();
  plan.clips[0].captions[0].endMs = 4100;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /inside the clip/,
  );
});
test("refuses a source without its original archive declaration", () => {
  const plan = mediaPlan();
  plan.sources[0].originalPreserved = false;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /preserved/,
  );
});

test("prompt question openers are bounded and included in the one-hour render limit", () => {
  const plan = {
    ...textPlan(),
    promptQuestion: "What memory would you like your family to keep?",
  };
  const validated = validateVideoPlan(plan, { requireApproval: false });
  assert.equal(validated.promptQuestion, plan.promptQuestion);
  assert.equal(chapterDurationFrames(validated), 600);
  assert.throws(
    () =>
      validateVideoPlan(
        { ...plan, promptQuestion: "x".repeat(221) },
        { requireApproval: false },
      ),
    /promptQuestion/,
  );
  assert.throws(
    () =>
      validateVideoPlan(
        { ...plan, promptQuestion: "hello\nworld" },
        { requireApproval: false },
      ),
    /promptQuestion/,
  );
  plan.clips[0].outMs = 3593000;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /one hour/,
  );
});
