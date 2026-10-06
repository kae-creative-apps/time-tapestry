import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationBatches,
  parseRecipientInvitations,
  recipientReplyDraftKey,
} from "../src/components/collection/recipient-sharing";

test("invitations preserve supplied names, normalize email, and never guess names from addresses", () => {
  assert.deepEqual(
    parseRecipientInvitations(
      "Sam Rivera <SAM@example.test>\nfriend@example.test; sam@example.test",
    ),
    [
      { name: "Sam Rivera", email: "sam@example.test" },
      { email: "friend@example.test" },
    ],
  );
  assert.throws(
    () => parseRecipientInvitations("Sam <wrong>"),
    /Check this email/,
  );
  assert.throws(() => parseRecipientInvitations(" \n "), /at least one/);
});

test("a large invitation list is split into bounded requests with no overall recipient cap", () => {
  const people = parseRecipientInvitations(
    Array.from(
      { length: 81 },
      (_, index) => `reader${index}@example.test`,
    ).join("\n"),
  );
  const batches = invitationBatches(people);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [25, 25, 25, 6],
  );
  assert.deepEqual(batches.flat(), people);
  assert.equal(people.length, 81);
});

test("reply drafts belong to an invited reader and chapter, independent of display name", () => {
  const first = recipientReplyDraftKey("reader-one", "same@example.test", "q1");
  assert.notEqual(
    first,
    recipientReplyDraftKey("reader-two", "same@example.test", "q1"),
  );
  assert.notEqual(
    first,
    recipientReplyDraftKey("reader-one", "same@example.test", "q2"),
  );
  assert.equal(
    first,
    recipientReplyDraftKey("reader-one", "updated@example.test", "q1"),
  );
  assert.equal(
    recipientReplyDraftKey(undefined, " Person@Example.test ", "q1"),
    recipientReplyDraftKey(undefined, "person@example.test", "q1"),
  );
});
