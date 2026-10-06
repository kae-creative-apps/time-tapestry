import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  appendTakeChunk,
  getLocalTake,
  getTakeBlob,
  putLocalTake,
  type LocalTake,
} from "../src/lib/collection/local-takes";
import {
  confirmSavedMediaSelection,
  latestMediaSelection,
  newestRecoverableTake,
} from "../src/lib/collection/saved-media-selection";

function take(overrides: Partial<LocalTake> = {}): LocalTake {
  return {
    id: crypto.randomUUID(),
    collectionId: "synthetic-story-library",
    questionId: "moment:synthetic-moment",
    prompt: "A memory",
    kind: "voice",
    text: "",
    mimeType: "audio/webm",
    mediaId: "synthetic-uploaded-media",
    state: "local",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

test("uploaded media stays pending until the story acknowledges selection", async () => {
  const recording = take();
  const writes: LocalTake[] = [];
  let acknowledge!: () => void;
  let selectionStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    selectionStarted = resolve;
  });
  const ack = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let finished = false;
  const pending = confirmSavedMediaSelection(
    recording,
    async (selected) => {
      assert.equal(selected.state, "local");
      assert.equal(selected.mediaId, recording.mediaId);
      selectionStarted();
      await ack;
    },
    async (value) => {
      writes.push(value);
    },
  ).then((value) => {
    finished = true;
    return value;
  });
  await started;
  assert.equal(finished, false);
  assert.deepEqual(
    writes.map((value) => value.state),
    ["local"],
  );
  acknowledge();
  assert.equal((await pending).state, "backed_up");
  assert.deepEqual(
    writes.map((value) => value.state),
    ["local", "backed_up"],
  );
});

test("failed attachment keeps uploaded identity and device chunks for retry", async () => {
  const recording = take();
  await putLocalTake(recording);
  await appendTakeChunk(recording.id, 0, new Blob(["original recorded bytes"]));
  await assert.rejects(
    confirmSavedMediaSelection(recording, async () => {
      throw new Error("A newer recording is already selected");
    }),
    /newer recording/,
  );
  const restored = (await getLocalTake(recording.id))!;
  assert.equal(restored.state, "local");
  assert.equal(restored.mediaId, recording.mediaId);
  assert.equal(
    await (await getTakeBlob(restored)).text(),
    "original recorded bytes",
  );
  let selectedId = "";
  const saved = await confirmSavedMediaSelection(restored, async (value) => {
    selectedId = value.mediaId!;
  });
  assert.equal(selectedId, recording.mediaId, "retry uses the existing upload");
  assert.equal(saved.state, "backed_up");
  assert.equal((await getLocalTake(recording.id))!.state, "backed_up");
  assert.equal(
    await (await getTakeBlob(saved)).text(),
    "original recorded bytes",
  );
});

test("a failed device checkpoint does not discard an acknowledged server selection", async () => {
  let selected = false;
  const saved = await confirmSavedMediaSelection(
    take(),
    async () => {
      selected = true;
    },
    async () => {
      throw new Error("Device storage unavailable");
    },
  );
  assert.equal(selected, true);
  assert.equal(saved.state, "backed_up");
});

test("selection requires an uploaded original audio or video recording", async () => {
  let calls = 0;
  const select = async () => {
    calls++;
  };
  await assert.rejects(
    confirmSavedMediaSelection(take({ kind: "text" }), select),
    /original audio or video/,
  );
  await assert.rejects(
    confirmSavedMediaSelection(take({ mediaId: undefined }), select),
    /Back up/,
  );
  assert.equal(calls, 0);
});

test("recovery considers all media modes and never replaces a newer choice with an older pending take", () => {
  const older = take({ id: "older-video", kind: "video" });
  const newer = take({
    id: "newer-voice",
    updatedAt: "2026-10-02T00:00:00.000Z",
  });
  const copies = { [older.id]: true, [newer.id]: true };
  assert.equal(
    newestRecoverableTake([older, newer], copies, new Set())?.id,
    newer.id,
  );
  assert.equal(
    newestRecoverableTake(
      [older, { ...newer, state: "backed_up" }],
      copies,
      new Set(),
    ),
    undefined,
  );
  assert.equal(
    newestRecoverableTake([older, newer], copies, new Set([newer.id])),
    undefined,
  );
  assert.equal(
    newestRecoverableTake(
      [older, newer],
      { ...copies, [newer.id]: false },
      new Set(),
    ),
    undefined,
  );
  const chosenAgain = {
    ...older,
    state: "backed_up" as const,
    updatedAt: "2026-10-03T00:00:00.000Z",
  };
  assert.equal(latestMediaSelection([chosenAgain, newer])?.id, older.id);
  assert.equal(
    newestRecoverableTake([chosenAgain, newer], copies, new Set()),
    undefined,
  );
});
