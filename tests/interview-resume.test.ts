import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { prepareCollection } from "../src/lib/collection/create";
import {
  interviewResumeState,
  recordedInterviewChapterIds,
} from "../src/lib/collection/interview-resume";
import {
  recoverInterruptedArchive,
  type ArchiveLocalTake,
} from "../src/lib/collection/archive-utils";
import {
  appendTakeChunk,
  getTakeBlob,
  listLocalTakes,
  putLocalTake,
} from "../src/lib/collection/local-takes";
import { buildInterviewContext } from "../src/lib/collection/conversation-agent";
import type {
  InterviewSession,
  InterviewTurn,
} from "../src/lib/collection/types";

Object.defineProperty(globalThis, "indexedDB", {
  configurable: true,
  value: new IDBFactory(),
});
const collection = () =>
  prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Casey Example", email: "casey@example.test" },
    recipient: { name: "Riley Example", email: "riley@example.test" },
  });
const turn = (
  id: string,
  role: "agent" | "user",
  sequence: number,
  text: string,
  chapterId?: InterviewTurn["chapterId"],
): InterviewTurn => ({
  id,
  role,
  sequence,
  text,
  chapterId,
  capturedAt: "2026-10-05T12:00:00Z",
  timing: "unaligned",
});
function session(): InterviewSession {
  return {
    id: "resume-session",
    provider: "elevenlabs",
    status: "active",
    startedAt: "2026-10-05T12:00:00Z",
    excludedTurnIds: [],
    turns: [
      turn(
        "question-one",
        "agent",
        0,
        "Tell me about someone whose kindness has stayed with you.",
      ),
      turn("answer-one", "user", 1, "My aunt welcomed me home.", "q1"),
      turn(
        "question-two",
        "agent",
        2,
        "Tell me about a decision that mattered to you and what you learned from it.",
      ),
    ],
    segments: [
      {
        id: "segment-one",
        localTakeId: "local-one",
        mediaId: "media-one",
        startMs: 0,
        durationMs: 12000,
        kind: "voice",
        createdAt: "2026-10-05T12:00:00Z",
      },
    ],
  };
}

test("reload restores the newly asked area and audio choice without treating the question as an answer", () => {
  const c = collection();
  c.interviews = [session()];
  const state = interviewResumeState(c);
  assert.equal(state.chapterId, "q2");
  assert.equal(state.kind, "voice");
  assert.equal(state.question, c.interviews[0].turns[2].text);
  assert.deepEqual(state.answeredChapterIds, ["q1"]);
  assert.deepEqual(state.missingChapterIds, ["q2", "q3", "q4"]);
  const context = buildInterviewContext(c, "resume-session");
  assert.equal(context.currentThemeId, "q2");
  assert.equal(context.lastAskedQuestion, state.question);
  assert.deepEqual(
    context.sourceEntries.map((entry) => entry.text),
    ["My aunt welcomed me home."],
  );
  assert.equal(JSON.stringify(context).includes(c.ownerKey), false);
});

test("excluded or superseded turns cannot mark an unfinished area ready on return", () => {
  const c = collection();
  const saved = session();
  c.interviews = [saved];
  saved.turns.push(turn("old-answer", "user", 3, "Outdated answer", "q2"));
  saved.turns.push({
    ...turn("replacement", "user", 4, "Corrected answer", "q2"),
    supersedesTurnId: "old-answer",
  });
  saved.excludedTurnIds.push("replacement");
  assert.deepEqual(recordedInterviewChapterIds(c), ["q1"]);
  const context = buildInterviewContext(c);
  assert.ok(
    context.sourceEntries.every((entry) => !entry.text.includes("answer")),
  );
  saved.segments = [];
  assert.deepEqual(recordedInterviewChapterIds(c), []);
});

test("one-answer-at-a-time recordings resume the server saved question and keep follow-up coverage", () => {
  const c = collection();
  c.currentQuestion = 2;
  c.takes = [
    {
      id: "saved-q1",
      questionId: "q1-f1",
      kind: "voice",
      text: "A small kindness",
      mediaId: "take-media",
      prompt: "What happened?",
      createdAt: c.createdAt,
    },
  ];
  c.selectedTakeIds["q1-f1"] = "saved-q1";
  const state = interviewResumeState(c);
  assert.equal(state.chapterId, "q3");
  assert.equal(state.kind, "voice");
  assert.deepEqual(state.answeredChapterIds, ["q1"]);
});

test("an interrupted archive reopens committed chunks without discarding their identity or inventing a tail", async () => {
  const original: ArchiveLocalTake = {
    id: "interrupted-device-copy",
    collectionId: "recover-device-fixture",
    questionId: "interview:resume-session",
    kind: "voice",
    text: "",
    prompt: "Interview recording",
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    state: "recording",
    mimeType: "audio/webm",
    archive: {
      version: 1,
      sessionId: "resume-session",
      sessionStartedAt: "2026-10-05T12:00:00Z",
      startMs: 240000,
    },
  };
  await putLocalTake(original);
  await appendTakeChunk(
    original.id,
    0,
    new Blob(["committed first second"]),
    1,
  );
  await appendTakeChunk(
    original.id,
    1,
    new Blob(["committed second second"]),
    2,
  );
  // A fresh read simulates loading this collection after the recording runtime is gone.
  const [stored] = await listLocalTakes(original.collectionId);
  const recovered = recoverInterruptedArchive(stored as ArchiveLocalTake);
  assert.equal(recovered.id, original.id);
  assert.equal(recovered.archive.sessionId, "resume-session");
  assert.equal(recovered.state, "local");
  assert.equal(recovered.archive.recovered, true);
  assert.equal(recovered.durationSeconds, 2);
  assert.equal(
    await (await getTakeBlob(recovered)).text(),
    "committed first secondcommitted second second",
  );
  assert.equal(
    recovered.mediaId,
    undefined,
    "device recovery does not claim cloud acknowledgement",
  );
  assert.equal(
    recoverInterruptedArchive(recovered),
    recovered,
    "reload recovery is idempotent",
  );
});

test("creating a new provider session on return still keeps the previous saved place", () => {
  const c = collection();
  c.interviews = [
    session(),
    {
      ...session(),
      id: "resumed-empty-session",
      startedAt: "2026-10-06T12:00:00Z",
      turns: [],
      segments: [],
    },
  ];
  const state = interviewResumeState(c);
  assert.equal(state.chapterId, "q2");
  assert.equal(state.kind, "voice");
  assert.equal(
    buildInterviewContext(c, "resumed-empty-session").currentThemeId,
    "q2",
  );
});
