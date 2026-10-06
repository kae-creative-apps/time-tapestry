import { test } from "node:test";
import assert from "node:assert/strict";
import { stripConversationPerformanceCues } from "../src/lib/collection/conversation-copy";

test("visible conversation responses omit the literal emotion tags seen in live replies", () => {
  assert.equal(
    stripConversationPerformanceCues("[smile] That is a memory worth keeping."),
    "That is a memory worth keeping.",
  );
  assert.equal(
    stripConversationPerformanceCues("[happy] Tell me more about that day."),
    "Tell me more about that day.",
  );
  assert.equal(
    stripConversationPerformanceCues(
      "(sighs) Take your time. *gently* What happened next?",
    ),
    "Take your time. What happened next?",
  );
});

test("only complete recognized cues are removed, preserving bracketed story details and emphasis", () => {
  const words =
    "You said [1956], (not 1957), and called it *kindness*. Was the note [happy birthday]?";
  assert.equal(stripConversationPerformanceCues(words), words);
  assert.equal(
    stripConversationPerformanceCues("She described it as **happy**."),
    "She described it as **happy**.",
  );
  assert.equal(
    stripConversationPerformanceCues(
      "[smiles warmly] Was it [June 1956] or (the following year)?",
    ),
    "Was it [June 1956] or (the following year)?",
  );
});

test("a response containing only performance cues has no words to replace the current question", () => {
  assert.equal(
    stripConversationPerformanceCues(" [ SMILE ] (gently) *warmly* "),
    "",
  );
});
