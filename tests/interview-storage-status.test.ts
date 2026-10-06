import test from "node:test";
import assert from "node:assert/strict";
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import {
  appendTakeChunk,
  getTakeBlob,
  putLocalTake,
  requestRecordingStorage,
} from "../src/lib/collection/local-takes";
import {
  acknowledgeArchive,
  type ArchiveLocalTake,
} from "../src/lib/collection/archive-utils";
import {
  hasUnconfirmedRecording,
  interviewSaveStatus,
} from "../src/lib/collection/interview-save-status";

Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});

function take(id: string): ArchiveLocalTake {
  const time = "2026-10-05T12:00:00.000Z";
  return {
    id,
    collectionId: "fictional-storage-status",
    questionId: "interview:session-one",
    prompt: "Interview recording",
    text: "",
    kind: "voice",
    mimeType: "audio/webm",
    createdAt: time,
    updatedAt: time,
    durationSeconds: 1,
    state: "local",
    archive: {
      version: 1,
      sessionId: "session-one",
      sessionStartedAt: time,
      startMs: 0,
      durationMs: 1000,
    },
  };
}

function status(
  recording: ArchiveLocalTake,
  localSaved: boolean,
  error?: string,
) {
  return interviewSaveStatus({
    recording: false,
    savingRecording: false,
    savingWords: false,
    pendingWords: 0,
    memoryWarning: false,
    recordings: [{ state: recording.state, localSaved, error }],
    hasSavedAnswers: recording.state === "backed_up",
  });
}

for (const [name, storage] of [
  ["denied", { persist: async () => false }],
  ["unsupported", {}],
  [
    "unavailable",
    {
      persist: async () => {
        throw new Error("Unavailable");
      },
    },
  ],
] as const) {
  test(`optional persistence ${name} still allows a real device save and confirmed backup`, async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage },
    });
    assert.equal(await requestRecordingStorage(), false);
    const local = take(`persistence-${name}`);
    await putLocalTake(local);
    await appendTakeChunk(local.id, 0, new Blob(["fictional recording"]), 1);
    assert.equal(
      await (await getTakeBlob(local)).text(),
      "fictional recording",
    );
    assert.match(status(local, true), /on this device/);
    assert.equal(hasUnconfirmedRecording([local]), true);

    const uploaded = { ...local, mediaId: `fictional-media-${name}` };
    let confirm!: () => void;
    const acknowledgement = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    const confirming = acknowledgeArchive(uploaded, () => acknowledgement);
    assert.equal(hasUnconfirmedRecording([uploaded]), true);
    assert.doesNotMatch(status(uploaded, true), /are backed up/);
    confirm();
    const saved = await confirming;
    assert.equal(hasUnconfirmedRecording([saved]), false);
    assert.equal(status(saved, true), "Your saved answers are backed up");
  });
}

test("a failed attachment keeps the exit guard and backup warning until a retry is acknowledged", async () => {
  const uploaded = { ...take("failed-ack"), mediaId: "fictional-media" };
  await assert.rejects(
    acknowledgeArchive(uploaded, async () => {
      throw new Error("Attachment was not confirmed");
    }),
    /not confirmed/,
  );
  assert.equal(hasUnconfirmedRecording([uploaded]), true);
  assert.match(
    status(uploaded, true, "Attachment was not confirmed"),
    /needs backup/,
  );
  const saved = await acknowledgeArchive(uploaded, async () => {});
  assert.equal(hasUnconfirmedRecording([saved]), false);
});

test("real device write failures remain visible, while confirmed empty attempts do not block leaving", async (t) => {
  const local = take("failed-device-write");
  await putLocalTake(local);
  const transaction = IDBDatabase.prototype.transaction;
  t.mock.method(
    IDBDatabase.prototype,
    "transaction",
    function (this: IDBDatabase, ...args: Parameters<typeof transaction>) {
      const tx = transaction.apply(this, args);
      queueMicrotask(() => tx.abort());
      return tx;
    },
  );
  await assert.rejects(
    appendTakeChunk(local.id, 0, new Blob(["not committed"]), 1),
    /storage|interrupted|abort/i,
  );
  assert.match(status(local, false), /Not fully saved/);
  assert.equal(hasUnconfirmedRecording([local]), true);
  assert.equal(
    hasUnconfirmedRecording([{ state: "local", empty: true }]),
    false,
  );
});
