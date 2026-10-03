import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnswerTake, InterviewSession } from "@/lib/collection/types";
import { storyOriginals } from "./story-originals";

const take = (
  id: string,
  mediaId?: string,
  kind: AnswerTake["kind"] = "voice",
): AnswerTake => ({
  id,
  mediaId,
  kind,
  questionId: "q1",
  prompt: "Who showed you kindness?",
  text: id,
  createdAt: "2026-10-03T00:00:00Z",
});
const session: InterviewSession = {
  id: "session-1",
  provider: "guided",
  status: "completed",
  startedAt: "2026-10-03T00:00:00Z",
  excludedTurnIds: [],
  turns: [
    {
      id: "first",
      sequence: 1,
      role: "user",
      text: "First answer",
      capturedAt: "2026-10-03T00:00:00Z",
      chapterId: "q1",
      timing: "estimated",
      startMs: 2000,
      endMs: 12000,
    },
    {
      id: "second",
      sequence: 2,
      role: "user",
      text: "Second answer",
      capturedAt: "2026-10-03T00:00:00Z",
      chapterId: "q1",
      timing: "estimated",
      startMs: 13000,
      endMs: 17000,
    },
    {
      id: "other",
      sequence: 3,
      role: "user",
      text: "Other chapter",
      capturedAt: "2026-10-03T00:00:00Z",
      chapterId: "q2",
      timing: "estimated",
      startMs: 23000,
      endMs: 28000,
    },
  ],
  segments: [
    {
      id: "segment-1",
      mediaId: "audio-1",
      kind: "voice",
      startMs: 0,
      durationMs: 10000,
      createdAt: "2026-10-03T00:00:00Z",
    },
    {
      id: "segment-2",
      mediaId: "video-2",
      kind: "video",
      startMs: 10000,
      durationMs: 10000,
      createdAt: "2026-10-03T00:00:00Z",
    },
    {
      id: "segment-3",
      mediaId: "video-3",
      kind: "video",
      startMs: 20000,
      durationMs: 10000,
      createdAt: "2026-10-03T00:00:00Z",
    },
  ],
};
test("only exact source take IDs appear, including the old take used by a saved draft", () => {
  const result = storyOriginals(
    {
      takes: [
        take("old", "old-audio"),
        take("new", "new-audio"),
        take("typed", undefined, "text"),
      ],
    },
    { id: "q1", sourceTakeIds: ["old", "typed", "missing"] },
  );
  assert.deepEqual(
    result.map((item) => item.mediaId),
    ["old-audio"],
  );
  assert.equal(result[0].fromInterview, false);
});
test("resolves all referenced full interview segments once with their actual media kind", () => {
  const result = storyOriginals(
    { takes: [], interviews: [session] },
    { id: "q1", sourceTakeIds: ["live-first", "live-second"] },
  );
  assert.deepEqual(result, [
    {
      mediaId: "audio-1",
      kind: "voice",
      fromInterview: true,
      sourceTakeIds: ["live-first"],
    },
    {
      mediaId: "video-2",
      kind: "video",
      fromInterview: true,
      sourceTakeIds: ["live-first", "live-second"],
    },
  ]);
  assert.ok(result.every((item) => !("inMs" in item) && !("outMs" in item)));
});
test("unaligned answers retain complete referenced segments without inventing trim boundaries", () => {
  const unaligned = structuredClone(session);
  unaligned.turns[0].timing = "unaligned";
  delete unaligned.turns[0].startMs;
  delete unaligned.turns[0].endMs;
  const result = storyOriginals(
    { takes: [], interviews: [unaligned] },
    { id: "q1", sourceTakeIds: ["live-first"] },
  );
  assert.deepEqual(
    result.map((item) => item.mediaId),
    ["audio-1", "video-2", "video-3"],
  );
});
test("excluded conversation answers do not introduce unrelated media", () => {
  const excluded = { ...session, excludedTurnIds: ["first"] };
  assert.deepEqual(
    storyOriginals(
      { takes: [], interviews: [excluded] },
      { id: "q1", sourceTakeIds: ["live-first"] },
    ),
    [],
  );
});
test("duplicate take references to one complete recording produce one native player", () => {
  const result = storyOriginals(
    { takes: [take("one", "same"), take("two", "same")] },
    { id: "q1", sourceTakeIds: ["one", "two", "one"] },
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].sourceTakeIds, ["one", "two"]);
});
