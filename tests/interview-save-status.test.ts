import test from "node:test";
import assert from "node:assert/strict";
import { interviewSaveStatus } from "../src/lib/collection/interview-save-status";

const saved = {
  recording: false,
  savingRecording: false,
  savingWords: false,
  pendingWords: 0,
  memoryWarning: false,
  recordings: [{ state: "backed_up" as const, localSaved: true }],
  hasSavedAnswers: true,
};

test("failed upload cannot be described as backed up while recording or paused", () => {
  for (const recording of [true, false]) {
    const result = interviewSaveStatus({
      ...saved,
      recording,
      recordings: [
        { state: "local", localSaved: true, error: "Upload failed" },
      ],
    });
    assert.match(result, /needs backup/);
    assert.doesNotMatch(result, /are backed up/);
  }
});

test("device-only and memory-only answers are distinguished from a confirmed backup", () => {
  assert.match(
    interviewSaveStatus({
      ...saved,
      recordings: [{ state: "local", localSaved: true }],
    }),
    /on this device/,
  );
  assert.match(
    interviewSaveStatus({
      ...saved,
      recordings: [{ state: "local", localSaved: false }],
    }),
    /Not fully saved/,
  );
  assert.match(
    interviewSaveStatus({ ...saved, memoryWarning: true }),
    /Not fully saved/,
  );
  assert.match(
    interviewSaveStatus({ ...saved, pendingWords: 1 }),
    /words still need backup/,
  );
  assert.equal(interviewSaveStatus(saved), "Your saved answers are backed up");
});

test("empty attempts do not imply saved progress or hide later confirmed backups", () => {
  const recordings = [
    {
      state: "local" as const,
      localSaved: false,
      error: "Recorder could not start",
      empty: true,
    },
  ];
  assert.equal(
    interviewSaveStatus({ ...saved, recordings, hasSavedAnswers: false }),
    "",
  );
  assert.equal(
    interviewSaveStatus({
      ...saved,
      recordings: [...recordings, ...saved.recordings],
    }),
    "Your saved answers are backed up",
  );
});

test("an active recorder distinguishes first save from committed local chunks", () => {
  assert.match(
    interviewSaveStatus({
      ...saved,
      recording: true,
      recordings: [{ state: "recording", localSaved: false }],
    }),
    /first save/,
  );
  assert.match(
    interviewSaveStatus({
      ...saved,
      recording: true,
      recordings: [{ state: "recording", localSaved: true }],
    }),
    /saving on this device/,
  );
});
