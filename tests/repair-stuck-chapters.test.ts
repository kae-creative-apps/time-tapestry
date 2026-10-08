import test from "node:test";
import assert from "node:assert/strict";
import { prepareCollection } from "../src/lib/collection/create";
import { interviewResumeState } from "../src/lib/collection/interview-resume";
import {
  applyStuckChapterAssignment,
  STUCK_CHAPTER_COLLECTION_ID,
} from "../src/lib/collection/repair-stuck-chapters";
import type {
  AnswerTake,
  InterviewSession,
  InterviewTurn,
} from "../src/lib/collection/types";

const SESSION_ID = "fdfaa3d2-3674-4a9f-9c12-2bdd98b35c64";

function turn(
  sequence: number,
  role: "agent" | "user",
  text: string,
): InterviewTurn {
  return {
    id: `${role}-${sequence}`,
    role,
    sequence,
    text,
    chapterId: role === "agent" && sequence >= 34 ? undefined : "q1",
    capturedAt: "2026-10-08T01:31:00.000Z",
    timing: "unaligned",
  };
}

function collection() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Casey Example", email: "casey@example.test" },
    recipient: { name: "Riley Example", email: "riley@example.test" },
  });
  c.id = STUCK_CHAPTER_COLLECTION_ID;
  const turns: InterviewTurn[] = [];
  for (let sequence = 0; sequence <= 33; sequence += 1) {
    turns.push(
      turn(
        sequence,
        sequence % 2 === 0 ? "agent" : "user",
        sequence % 2 === 0
          ? sequence >= 16
            ? "How has this part of your giving taken shape?"
            : "What made you become so generous?"
          : `Saved answer ${sequence} with enough words to keep.`,
      ),
    );
  }
  turns.push(turn(34, "agent", "You can finish when you are ready."));
  const session: InterviewSession = {
    id: SESSION_ID,
    provider: "elevenlabs",
    status: "completed",
    startedAt: "2026-10-08T01:31:15.857Z",
    excludedTurnIds: [],
    turns,
    segments: [
      {
        id: "segment-one",
        mediaId: "media-one",
        startMs: 4789,
        durationMs: 240006,
        kind: "video",
        createdAt: "2026-10-08T01:31:20.636Z",
      },
    ],
  };
  c.interviews = [session];
  const pending = (
    id: string,
    questionId: "q2" | "q3" | "q4",
  ): AnswerTake => ({
    id,
    questionId,
    prompt: "Recorded again",
    kind: questionId === "q2" ? "video" : "voice",
    text: "",
    mediaId: `media-${id}`,
    createdAt: "2026-10-08T02:35:00.000Z",
    transcriptionStatus: "pending",
    replacesChapterId: questionId,
  });
  c.takes = [
    pending("take-q2", "q2"),
    pending("take-q3", "q3"),
    pending("take-q4", "q4"),
  ];
  c.selectedTakeIds = {
    q2: "take-q2",
    q3: "take-q3",
    q4: "take-q4",
  };
  c.explicitTakeSelections = { q2: true, q3: true, q4: true };
  return c;
}

test("reassigns spoken answers and does not require empty pending transcripts", () => {
  const c = collection();
  assert.deepEqual(interviewResumeState(c).missingChapterIds, [
    "q2",
    "q3",
    "q4",
  ]);
  assert.equal(applyStuckChapterAssignment(c), true);
  assert.deepEqual(interviewResumeState(c).missingChapterIds, []);
  const chapter = (sequence: number) =>
    c.interviews![0].turns.find((item) => item.sequence === sequence)
      ?.chapterId;
  assert.equal(chapter(15), "q1");
  assert.equal(chapter(17), "q2");
  assert.equal(chapter(21), "q2");
  assert.equal(chapter(23), "q3");
  assert.equal(chapter(29), "q4");
  assert.equal(chapter(16), "q2");
  assert.equal(chapter(34), undefined);
  assert.deepEqual(c.selectedTakeIds, {});
  assert.equal(c.takes.length, 3);
  assert.equal(c.takes[0].text, "");
  assert.equal(c.takes[0].mediaId, "media-take-q2");
});

test("leaves a different collection and a finished repair unchanged", () => {
  const other = collection();
  other.id = "11111111-1111-4111-8111-111111111111";
  assert.equal(applyStuckChapterAssignment(other), false);
  assert.equal(other.interviews![0].turns[17].chapterId, "q1");
  assert.equal(other.selectedTakeIds.q2, "take-q2");

  const repaired = collection();
  assert.equal(applyStuckChapterAssignment(repaired), true);
  assert.equal(applyStuckChapterAssignment(repaired), false);
  assert.equal(repaired.takes.length, 3);
});

test("keeps a pending retake when its transcript is already meaningful", () => {
  const c = collection();
  c.takes[0].text = "A finished transcript of the new recording.";
  c.takes[0].transcriptionStatus = "ready";
  assert.equal(applyStuckChapterAssignment(c), true);
  assert.equal(c.selectedTakeIds.q2, "take-q2");
  assert.equal(c.selectedTakeIds.q3, undefined);
  assert.deepEqual(interviewResumeState(c).missingChapterIds, []);
});
