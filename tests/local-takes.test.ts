import test from "node:test";
import assert from "node:assert/strict";
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import {
  answerFromLocal,
  appendTakeChunk,
  getLocalTake,
  getTakeBlob,
  getTextDraft,
  listLocalTakes,
  putLocalTake,
  requestRecordingStorage,
  saveTextDraft,
  type LocalTake,
} from "../src/lib/collection/local-takes";

Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { storage: { persist: async () => true } },
});

function take(id: string, overrides: Partial<LocalTake> = {}): LocalTake {
  const time = "2026-10-02T12:00:00.000Z";
  return {
    id,
    collectionId: "family-test",
    questionId: "q1",
    prompt: "Tell me about a memory.",
    kind: "video",
    text: "",
    mimeType: "video/webm",
    createdAt: time,
    updatedAt: time,
    state: "recording",
    ...overrides,
  };
}

// These tests exercise the IndexedDB transactions used by the recording UI.
// They do not replace microphone, browser restart, or playback tests on devices.
test("recorded chunks survive an interrupted take and reconstruct in sequence", async () => {
  assert.equal(await requestRecordingStorage(), true);
  const original = take("recover-take");
  await putLocalTake(original);
  await appendTakeChunk(original.id, 2, new Blob(["third"]), 3);
  await appendTakeChunk(original.id, 0, new Blob(["first"]), 1);
  await appendTakeChunk(original.id, 1, new Blob(["second"]), 2);

  const recovered = (await listLocalTakes("family-test", "q1")).find(
    (item) => item.id === original.id,
  );
  assert.ok(recovered);
  assert.equal(
    recovered.state,
    "recording",
    "an interrupted take must remain recoverable before finalization",
  );
  assert.equal(await (await getTakeBlob(recovered)).text(), "firstsecondthird");
  assert.equal(recovered.mimeType, "video/webm");
  assert.equal(
    recovered.durationSeconds,
    3,
    "chunk retries cannot move the saved duration backwards",
  );
});

test("retrying a chunk save cannot duplicate the recording", async () => {
  const original = take("retry-take");
  await putLocalTake(original);
  await appendTakeChunk(original.id, 0, new Blob(["keep"]), 1);
  await appendTakeChunk(original.id, 0, new Blob(["keep"]), 1);
  await appendTakeChunk(original.id, 1, new Blob([" going"]), 2);
  assert.equal(await (await getTakeBlob(original)).text(), "keep going");
  assert.equal((await getLocalTake(original.id))?.durationSeconds, 2);
});

test("aborted chunk transactions reject without corrupting earlier saved chunks", async () => {
  const original = take("aborted-write");
  await putLocalTake(original);
  await appendTakeChunk(original.id, 0, new Blob(["before"]), 1);
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (
    ...args: Parameters<typeof transaction>
  ) {
    const tx = transaction.apply(this, args);
    queueMicrotask(() => tx.abort());
    return tx;
  };
  try {
    await assert.rejects(
      appendTakeChunk(original.id, 1, new Blob([" after"]), 2),
      /storage|interrupted|abort/i,
    );
  } finally {
    IDBDatabase.prototype.transaction = transaction;
  }
  assert.equal(await (await getTakeBlob(original)).text(), "before");
  assert.equal((await getLocalTake(original.id))?.durationSeconds, 1);
  await appendTakeChunk(original.id, 1, new Blob([" after"]), 2);
  assert.equal(await (await getTakeBlob(original)).text(), "before after");
});

test("backup and alternate takes preserve every original and the audio sidecar", async () => {
  const first = take("original-take", {
    collectionId: "keep-originals",
    audioMimeType: "audio/webm",
  });
  const second = take("alternate-take", { collectionId: "keep-originals" });
  await putLocalTake(first);
  await appendTakeChunk(first.id, 0, new Blob(["original-video"]), 1);
  await appendTakeChunk(`${first.id}_audio`, 0, new Blob(["original-audio"]));
  await putLocalTake({
    ...first,
    state: "backed_up",
    mediaId: "video-upload",
    audioMediaId: "audio-upload",
    durationSeconds: 1,
  });
  await putLocalTake(second);
  await appendTakeChunk(second.id, 0, new Blob(["alternate-video"]), 1);

  const originals = await listLocalTakes("keep-originals");
  assert.equal(originals.length, 2);
  assert.equal(await (await getTakeBlob(first)).text(), "original-video");
  assert.equal(
    await (
      await getTakeBlob({ id: `${first.id}_audio`, mimeType: "audio/webm" })
    ).text(),
    "original-audio",
  );
  assert.equal(await (await getTakeBlob(second)).text(), "alternate-video");
  const backedUp = await getLocalTake(first.id);
  assert.ok(backedUp);
  const answer = answerFromLocal(backedUp);
  assert.equal(answer.audioMediaId, "audio-upload");
  assert.equal(answer.mediaId, "video-upload");
  assert.equal("state" in answer, false);
  assert.equal("mimeType" in answer, false);
  assert.equal("audioMimeType" in answer, false);
  assert.equal("collectionId" in answer, false);
});

test("drafts and recordings stay scoped to their collection and question", async () => {
  await saveTextDraft("one", "q1", "First draft");
  await saveTextDraft("one", "q1", "Revised draft");
  await saveTextDraft("one", "q2", "Another memory");
  await saveTextDraft("two", "q1", "Another family");
  assert.equal(await getTextDraft("one", "q1"), "Revised draft");
  assert.equal(await getTextDraft("one", "q2"), "Another memory");
  assert.equal(await getTextDraft("two", "q1"), "Another family");
  assert.equal(await getTextDraft("missing", "q1"), "");
  await putLocalTake(
    take("scoped-one", { collectionId: "scoped", questionId: "q1" }),
  );
  await putLocalTake(
    take("scoped-two", { collectionId: "scoped", questionId: "q2" }),
  );
  assert.deepEqual(
    (await listLocalTakes("scoped", "q1")).map((item) => item.id),
    ["scoped-one"],
  );
});

test("an empty failed recording has no playable content and no false backup", async () => {
  const empty = take("empty-recording");
  await putLocalTake(empty);
  await appendTakeChunk(empty.id, 0, new Blob([]));
  await assert.rejects(getTakeBlob(empty), /No recorded audio or video/);
  assert.equal((await getLocalTake(empty.id))?.state, "recording");
});
