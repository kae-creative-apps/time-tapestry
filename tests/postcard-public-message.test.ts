import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePublicPostcardMessages,
  publicPostcardMessage,
  PUBLIC_POSTCARD_DEFAULTS,
} from "../src/lib/collection/postcard-public-message";

test("public print defaults do not derive from private story or blessing content", () => {
  const privateCollection = {
    chapters: [
      { id: "q1", title: "Private donation", postcardNote: "$50,000" },
    ],
    chapterBlessings: { q1: { encouragement: "Private family concern" } },
  };
  const message = publicPostcardMessage(privateCollection as {}, "q1");
  assert.equal(message, PUBLIC_POSTCARD_DEFAULTS.q1);
  assert.doesNotMatch(message, /50,000|Private/);
});

test("public messages require a deliberate complete bounded text selection", () => {
  const ids = ["q1", "q2", "q3", "q4"];
  assert.deepEqual(
    normalizePublicPostcardMessages(PUBLIC_POSTCARD_DEFAULTS, ids),
    PUBLIC_POSTCARD_DEFAULTS,
  );
  for (const input of [
    null,
    [],
    { q1: "Only one" },
    { ...PUBLIC_POSTCARD_DEFAULTS, q1: " " + "x".repeat(241) },
    { ...PUBLIC_POSTCARD_DEFAULTS, q2: { private: true } },
    { ...PUBLIC_POSTCARD_DEFAULTS, q5: "Unrecognized" },
  ]) {
    assert.throws(() => normalizePublicPostcardMessages(input, ids));
  }
  assert.equal(
    publicPostcardMessage(
      { postcardPublicMessages: { q1: " Chosen words " } },
      "q1",
    ),
    "Chosen words",
  );
});
