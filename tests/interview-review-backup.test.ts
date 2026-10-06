import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { prepareCollection } from "../src/lib/collection/create";
import {
  putLocalTake,
  appendTakeChunk,
  type LocalTake,
} from "../src/lib/collection/local-takes";
import {
  appendInterviewCommand,
  acknowledgeInterviewCommand,
} from "../src/lib/collection/interview-journal";
import {
  requireInterviewReviewBackup,
  interviewSaveNeedsConfirmation,
} from "../src/lib/collection/interview-review-backup";
import type { CollectionView } from "../src/lib/collection/types";

function fixture(): CollectionView {
  return {
    ...prepareCollection({
      initiationPath: "share",
      storyteller: { name: "Alex", email: "alex@example.test" },
      recipient: { name: "Sam", email: "sam@example.test" },
    }),
    role: "owner",
    capabilities: {
      tts: false,
      transcription: false,
      ai: false,
      mail: false,
      email: false,
      media: true,
      directUpload: false,
      liveInterview: false,
    },
  };
}
function take(c: CollectionView): LocalTake {
  return {
    id: crypto.randomUUID(),
    collectionId: c.id,
    questionId: "q1",
    prompt: "Kindness",
    kind: "voice",
    mimeType: "audio/webm",
    text: "",
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
    state: "local",
  };
}

test("saved recordings cannot imply safe closure before journal recovery and queued writes settle", () => {
  const state = {
    hasSavedProgress: true,
    journalReady: true,
    journalChecking: false,
    journalError: false,
    pendingWords: false,
    savingWords: false,
    memoryOnly: false,
  };
  assert.equal(interviewSaveNeedsConfirmation(state), false);
  for (const waiting of [
    { journalReady: false },
    { journalChecking: true },
    { journalError: true },
    { queuedWrites: true },
    { pendingWords: true },
    { savingWords: true },
    { memoryOnly: true },
  ])
    assert.equal(
      interviewSaveNeedsConfirmation({ ...state, ...waiting }),
      true,
    );
  assert.equal(
    interviewSaveNeedsConfirmation({
      ...state,
      hasSavedProgress: false,
      journalReady: false,
      journalChecking: true,
    }),
    false,
    "an untouched opening page has no saved activity to protect",
  );
});

test("optional review cannot submit over an unfinished replacement, but confirmed server attachment clears a lagging device status", async () => {
  const c = fixture();
  const replacement = take(c);
  await putLocalTake(replacement);
  await appendTakeChunk(replacement.id, 0, new Blob(["recorded bytes"]));
  await assert.rejects(
    requireInterviewReviewBackup(c),
    /recording still needs backup/,
  );
  c.takes.push({ ...replacement, mediaId: "confirmed-recording" });
  await assert.doesNotReject(requireInterviewReviewBackup(c));
});

test("local live segments require collection attachment, while completed empty attempts do not prevent submission", async () => {
  const c = fixture();
  const segment = { ...take(c), questionId: "interview:session" };
  await putLocalTake(segment);
  await appendTakeChunk(segment.id, 0, new Blob(["original bytes"]));
  await assert.rejects(requireInterviewReviewBackup(c), /backup/);
  c.interviews = [
    {
      id: "session",
      provider: "elevenlabs",
      startedAt: c.createdAt,
      status: "paused",
      turns: [],
      excludedTurnIds: [],
      segments: [
        {
          id: "segment",
          localTakeId: segment.id,
          mediaId: "confirmed-media",
          startMs: 0,
          durationMs: 5000,
          kind: "voice",
          createdAt: c.createdAt,
        },
      ],
    },
  ];
  await putLocalTake(take(c));
  await assert.doesNotReject(requireInterviewReviewBackup(c));
  await putLocalTake({ ...take(c), state: "recording" });
  await assert.rejects(requireInterviewReviewBackup(c), /backup/);
});

test("pending interview messages block optional-review submission until acknowledged", async () => {
  const c = fixture();
  const command = {
    id: crypto.randomUUID(),
    body: { action: "append_turns", turns: [] },
  };
  await appendInterviewCommand(c.id, command);
  await assert.rejects(
    requireInterviewReviewBackup(c),
    /updates still need backup/,
  );
  await acknowledgeInterviewCommand(c.id, command.id);
  await assert.doesNotReject(requireInterviewReviewBackup(c));
});
