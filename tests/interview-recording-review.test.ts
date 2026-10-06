import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prepareCollection } from "../src/lib/collection/create";
import {
  interviewRecordingReview,
  interviewRerecordPath,
  interviewReviewPath,
  unassignedInterviewRecordings,
} from "../src/lib/collection/interview-recording-review";
import {
  RecordingReviewChapter,
  RecordingReviewParts,
} from "../src/components/collection/InterviewRecordingReview";
import type { CollectionView } from "../src/lib/collection/types";

Object.assign(globalThis, { React });

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

test("optional review plays only selected recorded takes, including saved takes waiting for transcription", () => {
  const c = fixture();
  c.takes = [
    {
      id: "old",
      questionId: "q1",
      prompt: "Kindness",
      kind: "voice",
      mediaId: "old-media",
      text: "Earlier answer",
      createdAt: c.createdAt,
    },
    {
      id: "new",
      questionId: "q1",
      prompt: "Kindness",
      kind: "video",
      mediaId: "new-media",
      text: "",
      createdAt: c.createdAt,
    },
    {
      id: "text",
      questionId: "q2",
      prompt: "Choice",
      kind: "text",
      text: "Legacy written words",
      createdAt: c.createdAt,
    },
  ];
  c.selectedTakeIds = { q1: "new", q2: "text" };
  const [chapter, written] = interviewRecordingReview(c);
  assert.deepEqual(chapter.recordings, [
    { mediaId: "new-media", kind: "video", fromInterview: false },
  ]);
  assert.equal(chapter.ready, false);
  assert.equal(chapter.transcript, "");
  assert.deepEqual(written.recordings, []);
  assert.equal(
    c.takes.length,
    3,
    "read-only projection never deletes earlier originals",
  );
});

test("live review ignores excluded and superseded turns, retaining complete sources and approximate navigation only", () => {
  const c = fixture();
  c.interviews = [
    {
      id: "session",
      provider: "elevenlabs",
      status: "paused",
      startedAt: c.createdAt,
      excludedTurnIds: ["excluded"],
      segments: [
        {
          id: "segment-one",
          mediaId: "recording-one",
          startMs: 0,
          durationMs: 120_000,
          kind: "video",
          createdAt: c.createdAt,
        },
        {
          id: "segment-two",
          mediaId: "recording-two",
          startMs: 120_000,
          durationMs: 120_000,
          kind: "video",
          createdAt: c.createdAt,
        },
      ],
      turns: [
        {
          id: "old",
          role: "user",
          sequence: 1,
          chapterId: "q1",
          text: "An earlier transcript",
          startMs: 5000,
          endMs: 8000,
          timing: "estimated",
          capturedAt: c.createdAt,
        },
        {
          id: "new",
          supersedesTurnId: "old",
          role: "user",
          sequence: 2,
          chapterId: "q1",
          text: "A neighbor brought dinner.",
          startMs: 40_000,
          endMs: 50_000,
          timing: "estimated",
          capturedAt: c.createdAt,
        },
        {
          id: "excluded",
          role: "user",
          sequence: 3,
          chapterId: "q1",
          text: "Not selected",
          startMs: 140_000,
          endMs: 150_000,
          timing: "estimated",
          capturedAt: c.createdAt,
        },
        {
          id: "follow-up",
          role: "user",
          sequence: 4,
          chapterId: "q1",
          text: "I remember that kindness.",
          startMs: 55_000,
          endMs: 60_000,
          timing: "estimated",
          capturedAt: c.createdAt,
        },
      ],
    },
  ];
  const [chapter] = interviewRecordingReview(c);
  assert.equal(
    chapter.transcript,
    "A neighbor brought dinner.\n\nI remember that kindness.",
  );
  assert.deepEqual(chapter.recordings, [
    {
      mediaId: "recording-one",
      kind: "video",
      fromInterview: true,
      approximateStartSeconds: 38,
    },
  ]);
  assert.equal(
    "outMs" in chapter.recordings[0],
    false,
    "review never invents an exact cut",
  );
  c.interviews[0].turns.push({
    id: "unaligned",
    role: "user",
    sequence: 5,
    chapterId: "q1",
    text: "Another memory.",
    timing: "unaligned",
    capturedAt: c.createdAt,
  });
  const complete = interviewRecordingReview(c)[0];
  assert.equal(complete.recordings.length, 2);
  assert.equal(
    complete.recordings[0].approximateStartSeconds,
    undefined,
    "unaligned content must not silently skip to a guessed point",
  );
});

test("recording review offers actual playback and retake with no written-answer editor or autoplay", () => {
  const c = fixture();
  c.takes = [
    {
      id: "recorded",
      questionId: "q1",
      prompt: "Kindness",
      kind: "voice",
      mediaId: "original-recording",
      text: "My neighbor helped.",
      createdAt: c.createdAt,
    },
  ];
  c.selectedTakeIds.q1 = "recorded";
  const html = renderToStaticMarkup(
    createElement(RecordingReviewChapter, {
      chapter: interviewRecordingReview(c)[0],
      collectionId: c.id,
      accessKey: "synthetic-owner-key",
      busy: false,
      onRerecord() {},
    }),
  );
  assert.match(html, /<audio/);
  assert.match(html, /\/media\/original-recording/);
  assert.match(html, /Record again/);
  assert.match(html, /My neighbor helped\./);
  assert.match(html, /original stays saved until your new answer is ready/);
  assert.doesNotMatch(
    html,
    /textarea|contenteditable|<input|autoplay|Add words that were missed|\/speak/,
  );
});

test("recording review and retake routes retain encoded access and the exact selected part without arbitrary return URLs", () => {
  assert.equal(
    interviewReviewPath("collection/example", "key&example"),
    "/record/collection%2Fexample/review?key=key%26example",
  );
  assert.equal(
    interviewRerecordPath("collection", "key&example", "q3"),
    "/record/collection?key=key%26example&rerecord=q3",
  );
  assert.equal(
    interviewReviewPath("collection", "key", "q3"),
    "/record/collection/review?key=key&chapter=q3",
  );
});

test("saved live originals stay playable before provider transcript recovery or chapter matching", () => {
  const c = fixture();
  c.interviews = [
    {
      id: "source-only",
      provider: "elevenlabs",
      status: "paused",
      startedAt: c.createdAt,
      turns: [],
      excludedTurnIds: [],
      segments: [
        {
          id: "segment",
          mediaId: "saved-original",
          kind: "voice",
          startMs: 0,
          durationMs: 100_000,
          createdAt: c.createdAt,
        },
      ],
    },
  ];
  assert.equal(unassignedInterviewRecordings(c).length, 1);
  const chapters = interviewRecordingReview(c);
  assert.ok(
    chapters.every(
      (chapter) =>
        chapter.awaitingChapterMatch &&
        !chapter.ready &&
        chapter.recordings[0].mediaId === "saved-original",
    ),
  );
  const html = renderToStaticMarkup(
    createElement(RecordingReviewChapter, {
      chapter: chapters[0],
      collectionId: c.id,
      accessKey: "test-key",
      busy: false,
      onRerecord() {},
    }),
  );
  assert.match(html, /<audio/);
  assert.match(html, /check your saved interview for this section/);
  assert.doesNotMatch(html, /This part still needs a recorded answer/);
  c.interviews[0].turns = [
    {
      id: "untagged",
      role: "user",
      sequence: 0,
      text: "A saved memory.",
      timing: "unaligned",
      capturedAt: c.createdAt,
    },
  ];
  assert.equal(unassignedInterviewRecordings(c).length, 1);
  c.interviews[0].turns[0].chapterId = "q1";
  assert.equal(
    unassignedInterviewRecordings(c).length,
    0,
    "a known partial interview still needs its missing parts",
  );
  c.interviews[0].excludedTurnIds = ["untagged"];
  assert.equal(
    unassignedInterviewRecordings(c).length,
    0,
    "excluded history must not be reintroduced as a recovery source",
  );
});

test("only the selected part mounts a media player so switching parts cannot overlap playback", () => {
  const c = fixture();
  for (const id of ["q1", "q2", "q3", "q4"]) {
    c.takes.push({
      id,
      questionId: id,
      prompt: id,
      kind: "voice",
      mediaId: `media-${id}`,
      text: `My ${id} answer.`,
      createdAt: c.createdAt,
    });
    c.selectedTakeIds[id] = id;
  }
  const html = renderToStaticMarkup(
    createElement(RecordingReviewParts, {
      chapters: interviewRecordingReview(c),
      selectedChapterId: "q3",
      collectionId: c.id,
      accessKey: "test-key",
      busy: false,
      onSelect() {},
      onRerecord() {},
    }),
  );
  assert.equal((html.match(/<audio/g) ?? []).length, 1);
  assert.match(html, /\/media\/media-q3/);
  assert.doesNotMatch(html, /\/media\/media-q[124]/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
});
