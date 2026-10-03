import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  appendTakeChunk,
  getTakeBlob,
  listLocalTakes,
  putLocalTake,
} from "../src/lib/collection/local-takes";
import {
  acknowledgeArchive,
  archiveDurationMs,
  archiveSegment,
  archiveTimelineOffset,
  isArchiveTake,
  type ArchiveLocalTake,
} from "../src/lib/collection/archive-utils";

Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});

function take(
  id: string,
  overrides: Partial<ArchiveLocalTake> = {},
): ArchiveLocalTake {
  const time = "2026-10-02T12:00:00.000Z";
  return {
    id,
    collectionId: "interview-archive-test",
    questionId: "interview:session-one",
    prompt: "Interview recording",
    text: "",
    kind: "video",
    mimeType: "video/webm",
    createdAt: time,
    updatedAt: time,
    state: "recording",
    archive: {
      version: 1,
      sessionId: "session-one",
      sessionStartedAt: time,
      startMs: 1200,
    },
    ...overrides,
  };
}

test("interrupted interview segments recover their session, timing, and chunk order", async () => {
  const original = take("crash-recover-segment");
  await putLocalTake(original);
  await appendTakeChunk(original.id, 1, new Blob(["second"]), 2.125);
  await appendTakeChunk(original.id, 0, new Blob(["first"]), 1);
  const recovered = (await listLocalTakes(original.collectionId)).find(
    (item) => item.id === original.id,
  );
  assert.ok(recovered && isArchiveTake(recovered));
  assert.equal(recovered.archive.sessionId, "session-one");
  assert.equal(recovered.archive.startMs, 1200);
  assert.equal(archiveDurationMs(recovered), 2125);
  assert.equal(await (await getTakeBlob(recovered)).text(), "firstsecond");
});

test("session-relative timestamps include pause and reconnect gaps", () => {
  const startedAt = "2026-10-02T12:00:00.000Z";
  assert.equal(
    archiveTimelineOffset(startedAt, Date.parse(startedAt) + 315_250),
    315_250,
  );
  assert.equal(
    archiveTimelineOffset(startedAt, Date.parse(startedAt) - 100),
    0,
  );
  assert.throws(
    () => archiveTimelineOffset("not a date", Date.now()),
    /start time/,
  );
});

test("successful media upload alone never changes a segment to backed up", async () => {
  const uploaded = take("uploaded-awaiting-attachment", {
    state: "local",
    mediaId: "media-one",
    durationSeconds: 3.25,
  });
  await assert.rejects(
    acknowledgeArchive(uploaded, async () => {
      throw new Error("Attachment response lost");
    }),
    /response lost/,
  );
  assert.equal(uploaded.state, "local");
  assert.equal(uploaded.mediaId, "media-one");
  const ids: string[] = [];
  const persisted = await acknowledgeArchive(uploaded, async (segment) => {
    ids.push(segment.id);
    assert.equal(segment.mediaId, "media-one");
    assert.equal(segment.durationMs, 3250);
  });
  const repeated = await acknowledgeArchive(uploaded, async (segment) => {
    ids.push(segment.id);
  });
  assert.equal(persisted.state, "backed_up");
  assert.equal(repeated.state, "backed_up");
  assert.deepEqual(ids, [uploaded.id, uploaded.id]);
});

test("independently playable rollover files preserve overlap rather than dropping it", () => {
  const first = take("first-rollover", {
    mediaId: "media-first",
    archive: {
      version: 1,
      sessionId: "one",
      sessionStartedAt: "2026-10-02T12:00:00.000Z",
      startMs: 0,
      durationMs: 240_120,
    },
  });
  const next = take("next-rollover", {
    mediaId: "media-next",
    archive: {
      version: 1,
      sessionId: "one",
      sessionStartedAt: "2026-10-02T12:00:00.000Z",
      startMs: 240_050,
      durationMs: 180_000,
    },
  });
  assert.equal(
    archiveSegment(first).startMs +
      archiveSegment(first).durationMs -
      archiveSegment(next).startMs,
    70,
  );
  assert.notEqual(
    archiveSegment(first).localTakeId,
    archiveSegment(next).localTakeId,
  );
  assert.throws(() => archiveSegment(take("not-uploaded")), /not uploaded/);
});
