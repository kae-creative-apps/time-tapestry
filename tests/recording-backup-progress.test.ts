import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RecordingBackupProgress from "../src/components/collection/RecordingBackupProgress";
import {
  recordingBackupProgress,
  recordingUploadProgress,
} from "../src/lib/collection/recording-backup-progress";
import {
  acknowledgeArchive,
  type ArchiveLocalTake,
} from "../src/lib/collection/archive-utils";

const idle = { recording: false, saving: false };
const saving = { recording: false, saving: true };
const local = { id: "fictional-part-one", state: "local" as const };

test("upload percentages are measured from bytes, without invented progress", () => {
  const partial = recordingBackupProgress(
    [{ ...local, uploadProgress: recordingUploadProgress(420, 1000) }],
    saving,
  );
  assert.equal(partial.parts[0].percentage, 42);
  assert.equal(partial.confirmedParts, 0);
  assert.equal(partial.complete, false);
  assert.equal(
    recordingBackupProgress(
      [{ ...local, uploadProgress: recordingUploadProgress(0, 1000) }],
      saving,
    ).parts[0].percentage,
    0,
  );
  for (const [loaded, total] of [
    [20, 0],
    [NaN, 20],
    [10, Infinity],
  ]) {
    assert.equal(
      recordingBackupProgress(
        [{ ...local, uploadProgress: recordingUploadProgress(loaded, total) }],
        saving,
      ).parts[0].percentage,
      undefined,
    );
  }
  assert.equal(
    recordingBackupProgress(
      [{ ...local, uploadProgress: { stage: "uploading" } }],
      saving,
    ).parts[0].percentage,
    undefined,
  );
});

test("uploaded bytes never become a completed backup until the attachment is acknowledged", async () => {
  const time = "2026-10-05T12:00:00.000Z";
  const take: ArchiveLocalTake = {
    ...local,
    collectionId: "fictional-backup-progress",
    questionId: "interview:fictional-session",
    prompt: "Interview recording",
    text: "",
    kind: "voice",
    mimeType: "audio/webm",
    durationSeconds: 1,
    mediaId: "fictional-uploaded-media",
    createdAt: time,
    updatedAt: time,
    archive: {
      version: 1,
      sessionId: "fictional-session",
      sessionStartedAt: time,
      startMs: 0,
      durationMs: 1000,
    },
  };
  const uploaded = {
    ...take,
    uploadProgress: recordingUploadProgress(1000, 1000),
  };
  let acknowledge!: () => void;
  const pending = acknowledgeArchive(
    take,
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const progress = recordingBackupProgress([uploaded], saving);
  assert.equal(progress.parts[0].stage, "confirming");
  assert.equal(progress.parts[0].percentage, undefined);
  assert.equal(progress.confirmedParts, 0);
  assert.equal(progress.complete, false);
  acknowledge();
  const confirmed = await pending;
  assert.equal(
    recordingBackupProgress([confirmed], saving).complete,
    false,
    "finalization must finish too",
  );
  const complete = recordingBackupProgress([confirmed], idle);
  assert.equal(complete.confirmedParts, 1);
  assert.equal(complete.complete, true);
});

test("failed acknowledgement leaves a retryable part rather than showing 100 percent", () => {
  const progress = recordingBackupProgress(
    [
      {
        ...local,
        error: "Attachment failed",
        uploadProgress: recordingUploadProgress(100, 100),
      },
    ],
    idle,
  );
  assert.equal(progress.parts[0].stage, "failed");
  assert.equal(progress.complete, false);
  assert.equal(progress.confirmedParts, 0);
  const html = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, { progress }),
  );
  assert.match(html, /Use Retry backup below/);
  assert.match(html, /Keep this page open and your computer awake/);
  assert.doesNotMatch(html, /100%|value="100"/);
});

test("overall progress counts actual recording parts and ignores confirmed empty attempts", () => {
  const progress = recordingBackupProgress(
    [
      { id: "one", state: "backed_up" },
      {
        id: "two",
        state: "local",
        uploadProgress: recordingUploadProgress(50, 100),
      },
      { id: "three", state: "recording" },
      { id: "empty", state: "local", empty: true },
    ],
    { recording: true, saving: true },
  );
  assert.equal(progress.totalParts, 3);
  assert.equal(progress.confirmedParts, 1);
  assert.equal(progress.complete, false);
  assert.equal(progress.parts[2].stage, "recording");
  const html = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, { progress }),
  );
  assert.match(html, /max="3" value="1"/);
  assert.match(html, /uploading, 50%/);
  assert.match(html, /1 of 3 recording parts backed up/);
});

test("confirmation stays indeterminate and pending words retain the keep-open reminder", () => {
  const confirming = recordingBackupProgress(
    [{ ...local, uploadProgress: recordingUploadProgress(500, 500) }],
    saving,
  );
  const html = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, { progress: confirming }),
  );
  assert.match(html, /Confirming part 1 is saved" max="1"><\/progress>/);
  assert.equal((html.match(/<progress /g) ?? []).length, 1);
  assert.doesNotMatch(html, /100%|value="100"/);

  const complete = recordingBackupProgress(
    [{ ...local, state: "backed_up" }],
    idle,
  );
  const stillSaving = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, {
      progress: complete,
      pendingWords: true,
      safeToClose: true,
    }),
  );
  assert.match(stillSaving, /Keep this page open and your computer awake/);
  assert.match(stillSaving, /Confirming your saved interview/);
  assert.doesNotMatch(stillSaving, /Your recordings are backed up/);
  const done = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, {
      progress: complete,
      safeToClose: true,
    }),
  );
  assert.match(done, /Your recordings are backed up/);
  assert.match(done, /You can safely close this page/);
  assert.doesNotMatch(done, /Keep this page open/);
  assert.equal(
    renderToStaticMarkup(
      React.createElement(RecordingBackupProgress, {
        progress: recordingBackupProgress([], idle),
      }),
    ),
    "",
  );
});

test("final interview updates keep the page open after all recording attachments are confirmed", () => {
  const progress = recordingBackupProgress(
    [{ ...local, state: "backed_up" }],
    idle,
  );
  for (const safeToClose of [false, undefined]) {
    const html = renderToStaticMarkup(
      React.createElement(RecordingBackupProgress, { progress, safeToClose }),
    );
    assert.match(html, /Confirming your saved interview/);
    assert.match(html, /Keep this page open and your computer awake/);
    assert.doesNotMatch(
      html,
      /You can safely close|Your recordings are backed up/,
    );
    assert.match(
      html,
      /max="1"><\/progress>/,
      "confirmation must be indeterminate",
    );
  }
  const active = recordingBackupProgress([{ ...local, state: "backed_up" }], {
    recording: true,
    saving: false,
  });
  const html = renderToStaticMarkup(
    React.createElement(RecordingBackupProgress, {
      progress: active,
      safeToClose: true,
    }),
  );
  assert.doesNotMatch(
    html,
    /You can safely close|Your recordings are backed up/,
  );
});
