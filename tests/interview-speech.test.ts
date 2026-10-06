import assert from "node:assert/strict";
import test from "node:test";
import { prepareCollection } from "../src/lib/collection/create";
import { publicView } from "../src/lib/collection/access";
import {
  isMeaningfulInterviewSpeech,
  interviewSessionNeedsTranscriptRecovery,
} from "../src/lib/collection/interview-speech";
import { recordedInterviewChapterIds } from "../src/lib/collection/interview-resume";
import { interviewAnswers } from "../src/lib/collection/interview";
import {
  unassignedInterviewRecordings,
  interviewRecordingReview,
} from "../src/lib/collection/interview-recording-review";
import { recoverInterviewSourceWords } from "../src/lib/collection/interview-source-recovery";
import type {
  InterviewSession,
  InterviewTurn,
} from "../src/lib/collection/types";
import type { SourceWord } from "../src/lib/collection/films/word-matching";

const startedAt = "2026-10-06T12:00:00.000Z";
const utterance = (
  id: string,
  text: string,
  chapterId: InterviewTurn["chapterId"] = "q1",
): InterviewTurn => ({
  id,
  text,
  role: "user",
  chapterId,
  sequence: Number(id.replace(/\D/g, "")) || 0,
  capturedAt: startedAt,
  timing: "unaligned",
});
function fixture() {
  const c = prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Test", email: "owner@example.test" },
    recipient: { name: "Family", email: "recipient@example.test" },
  });
  const session: InterviewSession = {
    id: "speech-session",
    provider: "elevenlabs",
    status: "completed",
    startedAt,
    turns: [utterance("placeholder-1", "...")],
    excludedTurnIds: [],
    segments: [
      {
        id: "speech-segment",
        mediaId: "original-media",
        startMs: 0,
        durationMs: 300000,
        kind: "voice",
        createdAt: startedAt,
      },
    ],
  };
  c.interviews = [session];
  return { c, session };
}
function word(text: string, startMs: number): SourceWord {
  return {
    text,
    startMs,
    endMs: startMs + 400,
    mediaId: "original-media",
    speakerId: "speaker_0",
  };
}

test("meaningful speech excludes punctuation and app controls without imposing an answer length", () => {
  for (const text of [
    "",
    "  ",
    "...",
    "…",
    "?!",
    "[Interview control: Continue.]",
    " [interview control: next] ...",
    "[Interview control: unfinished",
  ])
    assert.equal(isMeaningfulInterviewSpeech(text), false, text);
  for (const text of [
    "Yes.",
    "No",
    "42",
    "Sí",
    "是",
    "نعم",
    "I",
    "[Interview control: Continue.] My grandmother.",
  ])
    assert.equal(isMeaningfulInterviewSpeech(text), true, text);
});

test("ellipsis and controls do not mark coverage or hide a preserved original from recovery", () => {
  const { c, session } = fixture();
  session.turns.push(
    utterance(
      "control-2",
      "[Interview control: Move to the fourth part.]",
      "q4",
    ),
  );
  c.currentQuestion = 3;
  assert.deepEqual(recordedInterviewChapterIds(c), []);
  assert.deepEqual(interviewAnswers(c, "q1"), []);
  assert.equal(unassignedInterviewRecordings(c).length, 1);
  assert.ok(
    interviewRecordingReview(publicView(c, "owner")).every(
      (chapter) => !chapter.ready && chapter.awaitingChapterMatch,
    ),
  );
  assert.equal(session.turns[0].text, "...");
});

test("a completed partial transcript remains recoverable while intentionally excluded speech stays excluded", () => {
  const { c, session } = fixture();
  session.turns = [utterance("speech-1", "My grandmother was kind.")];
  assert.equal(interviewSessionNeedsTranscriptRecovery(session), true);
  assert.equal(unassignedInterviewRecordings(c).length, 1);
  session.excludedTurnIds = ["speech-1"];
  assert.equal(interviewSessionNeedsTranscriptRecovery(session), false);
  assert.equal(unassignedInterviewRecordings(c).length, 0);
});

test("raw source words use known question topics and preserve placeholder history", () => {
  const { c, session } = fixture();
  const questions = [
    "Tell me about someone whose kindness has stayed with you.",
    "Tell me about a decision that mattered to you and what you learned from it.",
    "When you think about helping others over the years, is there a person or a story that comes to mind?",
    "As we move to our final theme, what is one thing you most want Sam to know or remember from your life as she walks her own path?",
  ];
  for (const [index, text] of questions.entries())
    session.turns.push({
      id: `question-${index}`,
      role: "agent",
      text,
      sequence: index + 1,
      capturedAt: new Date(Date.parse(startedAt) + index * 60000).toISOString(),
      timing: "unaligned",
    });
  const sources = [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("Kindness.", 10000),
        word("Forgiveness.", 70000),
        word("Meals.", 130000),
        word("Listen.", 190000),
      ],
    },
  ];
  session.turns = recoverInterviewSourceWords(session, sources);
  assert.deepEqual(recordedInterviewChapterIds(c), ["q1", "q2", "q3", "q4"]);
  assert.equal(
    session.turns.find((turn) => turn.id === "placeholder-1")?.text,
    "...",
  );
  assert.equal(interviewAnswers(c, "q4")[0].text, "Listen.");
  assert.ok(
    session.turns
      .filter((turn) => turn.id.startsWith("source-"))
      .every(
        (turn) => turn.timing === "unaligned" && turn.startMs === undefined,
      ),
  );
});

test("source speech without reliable topic evidence stays unassigned and never fabricates four answers", () => {
  const { c, session } = fixture();
  session.turns = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped.", 2000),
      ],
    },
  ]);
  assert.deepEqual(recordedInterviewChapterIds(c), []);
  assert.equal(session.turns.at(-1)?.text, "My grandmother helped.");
  assert.equal(session.turns.at(-1)?.chapterId, undefined);
  assert.equal(unassignedInterviewRecordings(c).length, 1);
});

test("raw recovery never reintroduces excluded source words", () => {
  const { session } = fixture();
  session.turns.push(utterance("excluded-2", "My grandmother helped."));
  session.excludedTurnIds.push("excluded-2");
  const next = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped.", 2000),
      ],
    },
  ]);
  assert.equal(next.length, session.turns.length);
  assert.deepEqual(next, session.turns);
});

test("silent or ambiguous recordings do not create a spoken answer", () => {
  const { session } = fixture();
  assert.throws(
    () =>
      recoverInterviewSourceWords(session, [
        {
          segment: session.segments[0],
          durationMs: 300000,
          words: [word("...", 1000)],
        },
      ]),
    /recognizable speech/,
  );
  assert.throws(
    () =>
      recoverInterviewSourceWords(session, [
        {
          segment: session.segments[0],
          durationMs: 300000,
          words: [
            word("Hello", 1000),
            { ...word("there", 2000), speakerId: "speaker_1" },
          ],
        },
      ]),
    /more than one detected speaker/,
  );
});
