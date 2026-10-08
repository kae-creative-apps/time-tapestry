import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const claim = readFileSync(
  "src/components/organizations/GiftClaim.tsx",
  "utf8",
);
const start = readFileSync(
  "src/components/collection/LiveInterview.tsx",
  "utf8",
);

test("the donor gift page drops the four-part intro and keeps a short claim", () => {
  assert.match(claim, /Share why you give\./);
  assert.match(
    claim,
    /A short conversation for someone you love\. Never about amounts\./,
  );
  assert.match(claim, /Let's begin\./);
  assert.match(claim, /Start my story/);
  assert.match(claim, /Who it's for/);
  assert.match(claim, /name="storytellerName"/);
  assert.match(claim, /name="storytellerEmail"/);
  assert.match(claim, /name="recipientName"/);
  assert.match(claim, /name="recipientEmail"/);
  assert.match(claim, /designatedRecipientConfirmed/);
  assert.doesNotMatch(claim, /InterviewProgress/);
  assert.doesNotMatch(claim, /Your story, in four parts/);
  assert.doesNotMatch(claim, /Follow-ups depend/);
  assert.doesNotMatch(claim, /one question at a time/i);
  assert.doesNotMatch(claim, /payment details/i);
  assert.doesNotMatch(claim, /You, the storyteller/);
  assert.doesNotMatch(claim, /recipientPhone/);
  assert.doesNotMatch(claim, /Make this gift yours/);
});

test("the interview start screen stays short without changing the conversation", () => {
  assert.match(start, /Let's begin\./);
  assert.match(start, /A short conversation for \$\{collection\.recipient\.name\}\./);
  assert.match(start, /You can pause anytime\./);
  assert.match(start, /Nothing is\s+sent until you approve\./);
  assert.doesNotMatch(start, /Take your time\. Your story matters/);
  assert.doesNotMatch(start, /walk with Jesus/);
  assert.doesNotMatch(
    start,
    /We will take this one question at a time/,
  );
});
