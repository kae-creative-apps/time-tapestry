import assert from "node:assert/strict";
import test from "node:test";
import { prepareCollection } from "../src/lib/collection/create";
import { chapterOpeningQuestion } from "../src/lib/collection/films/question-card";
import {
  QUESTION_CARD_SECONDS,
  chapterDurationFrames,
  chapterIntroSeconds,
  validateVideoPlan,
  type ChapterVideoPlan,
} from "../src/lib/video-plan";
import example from "../video/examples/text-preview.json";

const collection = () =>
  prepareCollection({
    initiationPath: "share",
    storyteller: { name: "Gigi", email: "gigi@example.com" },
    recipient: { name: "Sammie", email: "sammie@example.com" },
  });

test("the question card uses the interviewer's saved question", () => {
  const c = collection();
  c.interviews = [
    {
      id: "session",
      provider: "elevenlabs",
      status: "completed",
      startedAt: c.createdAt,
      turns: [
        {
          id: "ask",
          sequence: 1,
          role: "agent",
          text: "  Who noticed you\non a cold morning?  ",
          capturedAt: c.createdAt,
          chapterId: "q1",
          timing: "unaligned",
        },
        {
          id: "answer",
          sequence: 2,
          role: "user",
          text: "My mother did.",
          capturedAt: c.createdAt,
          chapterId: "q1",
          timing: "unaligned",
        },
      ],
      segments: [],
      excludedTurnIds: [],
    },
  ];
  assert.equal(
    chapterOpeningQuestion(c, "q1"),
    "Who noticed you on a cold morning?",
  );
});

test("a chapter with no saved question falls back to the written prompt", () => {
  const c = collection();
  assert.equal(
    chapterOpeningQuestion(c, "q4"),
    "What do you hope Sammie carries from your life of giving?",
  );
});

test("a question card is five seconds and does not change the older title timing", () => {
  const plan = structuredClone(example) as ChapterVideoPlan;
  assert.equal(chapterIntroSeconds(plan), 3);
  plan.questionCard = {
    question: "Tell me about someone whose kindness has stayed with you.",
    label: "Kindness",
    durationMs: 5000,
    music: {
      relativePath: "question-card-music.wav",
      sha256: "ab".repeat(32),
    },
  };
  const validated = validateVideoPlan(plan, { requireApproval: false });
  assert.equal(chapterIntroSeconds(validated), QUESTION_CARD_SECONDS);
  assert.equal(chapterDurationFrames(validated), (5 + 4) * 30 + 300);
  plan.questionCard = { ...plan.questionCard, durationMs: 4000 as 5000 };
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /question card/i,
  );
});
