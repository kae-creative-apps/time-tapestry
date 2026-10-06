import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInterviewMessage } from "../src/lib/collection/interview-message-identity";

test("24 answers without provider IDs remain separate, including repeated words", () => {
  const saved = new Map<string, { id: string; text: string }>();
  const answers = Array.from({ length: 24 }, (_, index) =>
    index % 2 ? "Yes, I remember." : `A memory from year ${1960 + index}.`,
  );
  for (const text of answers) {
    const identity = classifyInterviewMessage(
      "connection-one",
      { role: "user", message: text },
      saved,
    );
    assert.equal(identity.eventKey, null);
    assert.equal(identity.duplicate, false);
    assert.equal(identity.supersedesTurnId, undefined);
  }
});

test("empty or invalid runtime IDs cannot create a shared correction key", () => {
  const saved = new Map<string, { id: string; text: string }>();
  for (const event_id of [undefined, null, "", "  ", NaN, Infinity, {}, []]) {
    const identity = classifyInterviewMessage(
      "connection-one",
      { role: "user", message: "Another memory.", event_id, response_id: " " },
      saved,
    );
    assert.equal(identity.eventKey, null);
    assert.equal(identity.duplicate, false);
    assert.equal(identity.supersedesTurnId, undefined);
  }
});

test("an explicit user event preserves resend deduplication and correction chains", () => {
  const saved = new Map<string, { id: string; text: string }>();
  const original = {
    role: "user" as const,
    message: "It was 1956.",
    event_id: 0,
  };
  const first = classifyInterviewMessage("connection-one", original, saved);
  assert.ok(first.eventKey);
  assert.equal(first.supersedesTurnId, undefined);
  saved.set(first.eventKey, { id: "original-turn", text: original.message });
  assert.equal(
    classifyInterviewMessage("connection-one", original, saved).duplicate,
    true,
  );
  const correction = classifyInterviewMessage(
    "connection-one",
    { ...original, message: "It was 1957." },
    saved,
  );
  assert.equal(correction.duplicate, false);
  assert.equal(correction.supersedesTurnId, "original-turn");
  saved.set(first.eventKey, { id: "corrected-turn", text: "It was 1957." });
  assert.equal(
    classifyInterviewMessage(
      "connection-one",
      { ...original, message: "It was 1958." },
      saved,
    ).supersedesTurnId,
    "corrected-turn",
  );
});

test("the same words under distinct event IDs are distinct answers", () => {
  const first = classifyInterviewMessage(
    "connection-one",
    { role: "user", message: "Yes.", event_id: 1 },
    new Map(),
  );
  assert.ok(first.eventKey);
  const next = classifyInterviewMessage(
    "connection-one",
    { role: "user", message: "Yes.", event_id: 2 },
    new Map([[first.eventKey, { id: "first-turn", text: "Yes." }]]),
  );
  assert.notEqual(next.eventKey, first.eventKey);
  assert.equal(next.duplicate, false);
  assert.equal(next.supersedesTurnId, undefined);
});

test("connection, role, and identifier namespaces cannot collide", () => {
  const saved = new Map<string, { id: string; text: string }>();
  const keys = [
    classifyInterviewMessage(
      "connection-one",
      { role: "user", message: "A memory.", event_id: 1 },
      saved,
    ).eventKey,
    classifyInterviewMessage(
      "connection-two",
      { role: "user", message: "A memory.", event_id: 1 },
      saved,
    ).eventKey,
    classifyInterviewMessage(
      "connection-one",
      { role: "agent", message: "A question.", event_id: 1 },
      saved,
    ).eventKey,
    classifyInterviewMessage(
      "connection-one",
      { role: "user", message: "A memory.", response_id: "1" },
      saved,
    ).eventKey,
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test("stable agent response IDs span resend event IDs without replacing user answers", () => {
  const first = classifyInterviewMessage(
    "connection-one",
    {
      role: "agent",
      message: "Tell me about that day.",
      response_id: "reply-1",
      event_id: 3,
    },
    new Map(),
  );
  assert.ok(first.eventKey);
  const saved = new Map([
    [first.eventKey, { id: "agent-turn", text: "Tell me about that day." }],
  ]);
  const resend = classifyInterviewMessage(
    "connection-one",
    {
      role: "agent",
      message: "Tell me about that day.",
      response_id: "reply-1",
      event_id: 4,
    },
    saved,
  );
  assert.equal(resend.eventKey, first.eventKey);
  assert.equal(resend.duplicate, true);
  const changed = classifyInterviewMessage(
    "connection-one",
    {
      role: "agent",
      message: "What happened that day?",
      response_id: "reply-1",
      event_id: 4,
    },
    saved,
  );
  assert.equal(changed.duplicate, false);
  assert.equal(changed.supersedesTurnId, undefined);
});
