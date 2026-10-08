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

test("a short chapter retake still recovers the rest of its recording", () => {
  const { session } = fixture();
  session.replacesChapterId = "q4";
  session.turns = [
    utterance("short-1", "Courage.", "q4"),
    utterance("short-2", "Plant sunflowers nearby.", "q4"),
  ];
  assert.equal(interviewSessionNeedsTranscriptRecovery(session), true);
  session.turns.push(
    utterance(
      "long-3",
      "I hope you carry courage and plant sunflowers wherever you settle.",
      "q4",
    ),
  );
  assert.equal(interviewSessionNeedsTranscriptRecovery(session), false);
});

const retakeWords =
  "I hope you carry courage and plant sunflowers wherever you settle.".split(
    " ",
  );
function recoverRetake(turns: InterviewTurn[], excludedTurnIds: string[] = []) {
  const { session } = fixture();
  session.replacesChapterId = "q4";
  session.turns = turns;
  session.excludedTurnIds = excludedTurnIds;
  const next = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: retakeWords.map((text, index) => word(text, 1000 + index * 500)),
    },
  ]);
  return {
    session,
    next,
    recovered: next.filter((turn) => turn.id.startsWith("source-")),
  };
}

test("a short chapter retake recovers its whole recording when its fragments span it", () => {
  const { session, next, recovered } = recoverRetake([
    utterance("short-1", "Courage.", "q4"),
    utterance("short-2", "I hope settle.", "q4"),
  ]);
  assert.deepEqual(next.slice(0, 2), session.turns);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].text, retakeWords.join(" "));
  assert.equal(recovered[0].chapterId, "q4");
  assert.equal(
    interviewSessionNeedsTranscriptRecovery({ ...session, turns: next }),
    false,
  );
});

test("a retake fragment the scribe heard differently does not stop the rest of the retake", () => {
  const { recovered } = recoverRetake([
    utterance("short-1", "Courage.", "q4"),
    utterance("short-2", "Plant tulips anywhere.", "q4"),
  ]);
  assert.deepEqual(
    recovered.map((turn) => turn.text),
    [retakeWords.join(" ")],
  );
});

test("a recovered retake keeps out left-out words and stops when it cannot find them", () => {
  const { recovered } = recoverRetake(
    [
      utterance("short-1", "Courage.", "q4"),
      utterance("left-2", "And plant sunflowers wherever.", "q4"),
    ],
    ["left-2"],
  );
  assert.deepEqual(
    recovered.map((turn) => turn.text),
    ["I hope you carry courage", "you settle."],
  );
  const missing = recoverRetake(
    [
      utterance("short-1", "Courage.", "q4"),
      utterance("left-2", "Plant tulips anywhere.", "q4"),
    ],
    ["left-2"],
  );
  assert.deepEqual(missing.next, missing.session.turns);
});

test("a corrected retake fragment does not keep its own speech out", () => {
  const { recovered } = recoverRetake(
    [
      utterance("short-1", "Courage and plants.", "q4"),
      {
        ...utterance("short-3", "Courage and plant.", "q4"),
        supersedesTurnId: "short-1",
      },
    ],
    ["short-1"],
  );
  assert.deepEqual(
    recovered.map((turn) => turn.text),
    [retakeWords.join(" ")],
  );
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

test("silent recordings do not create a spoken answer", () => {
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
});

test("a second speaker never blocks recovery", () => {
  const { session } = fixture();
  const tied = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("Hello", 1000),
        { ...word("there", 2000), speakerId: "speaker_1" },
      ],
    },
  ]);
  assert.deepEqual(tied, session.turns);

  const dominant = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped", 2000),
        word("every", 2500),
        word("morning", 3000),
        { ...word("Next", 8000), speakerId: "speaker_1", endMs: 8200 },
      ],
    },
  ]);
  const recovered = dominant.map((turn) => turn.text).join(" ");
  assert.match(recovered, /My grandmother helped every morning/);
  assert.doesNotMatch(recovered, /Next/);

  const saved = fixture().session;
  saved.turns.push(utterance("saved-answer", "My grandmother helped."));
  const matched = recoverInterviewSourceWords(saved, [
    {
      segment: saved.segments[0],
      durationMs: 300000,
      words: [
        { ...word("What", 0), speakerId: "speaker_1", endMs: 5000 },
        { ...word("is", 5100), speakerId: "speaker_1", endMs: 9000 },
        { ...word("your", 9100), speakerId: "speaker_1", endMs: 14000 },
        { ...word("story", 14100), speakerId: "speaker_1", endMs: 20000 },
        word("My", 21000),
        word("grandmother", 21400),
        word("helped.", 21800),
      ],
    },
  ]);
  assert.equal(
    matched.some((turn) => turn.text.includes("What is your story")),
    false,
  );
  assert.equal(
    matched.some((turn) => turn.text.includes("grandmother")),
    true,
  );

  const unmatched = fixture().session;
  unmatched.turns.push(
    utterance("saved-other", "My grandmother helped me every single morning."),
  );
  const kept = recoverInterviewSourceWords(unmatched, [
    {
      segment: unmatched.segments[0],
      durationMs: 300000,
      words: [
        word("The", 1000),
        word("weather", 1500),
        word("was", 2000),
        word("beautiful", 2500),
        word("today", 3000),
        { ...word("Okay", 8000), speakerId: "speaker_1", endMs: 8200 },
      ],
    },
  ]);
  assert.deepEqual(kept, unmatched.turns);
});

test("a single speaker still stops when saved words cannot be matched", () => {
  const { session } = fixture();
  session.turns.push(
    utterance("saved-other", "My grandmother helped me every single morning."),
  );
  assert.throws(
    () =>
      recoverInterviewSourceWords(session, [
        {
          segment: session.segments[0],
          durationMs: 300000,
          words: [
            word("The", 1000),
            word("weather", 1500),
            word("was", 2000),
            word("beautiful", 2500),
          ],
        },
      ]),
    /could not be matched/,
  );
});

test("a one-word scribe disagreement still covers the saved answer", () => {
  const { session } = fixture();
  session.turns.push(
    utterance("saved-answer", "My grandmother helped me every morning."),
  );
  const next = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped", 2000),
        word("me", 2500),
        word("each", 3000),
        word("morning.", 3500),
        word("Later", 20000),
        word("note.", 20400),
      ],
    },
  ]);
  assert.equal(
    next.filter((turn) => turn.text.includes("grandmother")).length,
    1,
  );
  assert.equal(next.filter((turn) => turn.id.startsWith("source-")).length, 1);
  assert.match(next.at(-1)?.text ?? "", /Later note/);
});

test("one unmatched answer does not stop the rest of a single-speaker interview", () => {
  const { session } = fixture();
  session.turns.push(utterance("saved-answer", "My grandmother helped."));
  session.turns.push(
    utterance(
      "saved-other",
      "My grandmother helped me every single morning.",
      "q2",
    ),
  );
  const next = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped.", 2000),
        word("The", 8000),
        word("weather", 8500),
        word("was", 9000),
        word("beautiful", 9500),
      ],
    },
  ]);
  assert.deepEqual(next, session.turns);
});

test("an excluded answer the scribe heard differently is not added back", () => {
  const { session } = fixture();
  session.turns.push(
    utterance("excluded-2", "My grandmother helped me every morning."),
  );
  session.excludedTurnIds.push("excluded-2");
  const next = recoverInterviewSourceWords(session, [
    {
      segment: session.segments[0],
      durationMs: 300000,
      words: [
        word("My", 1000),
        word("grandmother", 1500),
        word("helped", 2000),
        word("me", 2500),
        word("each", 3000),
        word("morning.", 3500),
      ],
    },
  ]);
  assert.equal(next.length, session.turns.length);
  assert.equal(
    next.some((turn) => turn.id.startsWith("source-")),
    false,
  );
});
