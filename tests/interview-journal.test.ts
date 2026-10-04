import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  acknowledgeInterviewCommand,
  appendInterviewCommand,
  readInterviewJournal,
} from "../src/lib/collection/interview-journal";

Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});

test("a backup acknowledgement cannot erase an answer captured during the request", async () => {
  const id = "concurrent-journal";
  await appendInterviewCommand(id, {
    id: "first",
    body: { text: "First story" },
  });
  await Promise.all([
    acknowledgeInterviewCommand(id, "first"),
    appendInterviewCommand(id, {
      id: "second",
      body: { text: "Another memory" },
    }),
    appendInterviewCommand(id, { id: "third", body: { text: "A correction" } }),
  ]);
  assert.deepEqual(
    (await readInterviewJournal(id)).map((x) => x.id),
    ["second", "third"],
  );
});
test("retries preserve exactly one immutable command and reject conflicting ids", async () => {
  const id = "idempotent-journal";
  const command = { id: "same-id", body: { text: "Keep these words" } };
  await Promise.all([
    appendInterviewCommand(id, command),
    appendInterviewCommand(id, command),
  ]);
  assert.equal((await readInterviewJournal(id)).length, 1);
  await assert.rejects(
    appendInterviewCommand(id, {
      id: "same-id",
      body: { text: "Replace them" },
    }),
    /conflicts/,
  );
  assert.equal(
    (await readInterviewJournal(id))[0].body.text,
    "Keep these words",
  );
  await acknowledgeInterviewCommand(id, "same-id");
  assert.deepEqual(await readInterviewJournal(id), []);
});
