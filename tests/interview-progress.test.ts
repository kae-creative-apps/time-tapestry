import test from "node:test";
import assert from "node:assert/strict";
import {
  getInterviewProgress,
  nextUnansweredChapterId,
  interviewChapterTitle,
  detectInterviewThemeFromQuestion,
} from "../src/lib/collection/interview-progress";

test("a new conversation has four areas and three other areas ahead", () => {
  const progress = getInterviewProgress("q1", []);
  assert.equal(progress.position, 1);
  assert.equal(progress.answeredCount, 0);
  assert.equal(progress.otherAreasRemaining, 3);
  assert.equal(nextUnansweredChapterId("q1", []), "q2");
});

test("planned area questions are recognized without treating closing or follow-up text as a new area", () => {
  assert.equal(
    detectInterviewThemeFromQuestion(
      "Tell me about someone whose kindness has stayed with you.",
    ),
    "q1",
  );
  for (const apostrophe of ["'", "’"])
    assert.equal(
      detectInterviewThemeFromQuestion(
        `Take your time. Tell me about a moment when someone${apostrophe}s kindness made a difference in your life.`,
      ),
      "q1",
    );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "Tell me about a decision that mattered to you and what you learned from it.",
    ),
    "q2",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "What is a decision you made while following Jesus that later changed your life for the better?",
    ),
    "q2",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "When you think about helping others over the years, is there a person or a story that comes to mind?",
    ),
    "q3",
  );
  assert.equal(
    detectInterviewThemeFromQuestion("What made you become so generous?"),
    "q1",
  );
  assert.equal(
    detectInterviewThemeFromQuestion("How has your faith shaped why you give?"),
    "q2",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "What values have guided the way you give?",
    ),
    "q2",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "Why did you fall in love with these ministries you give to?",
    ),
    "q3",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "What do you hope Sammie carries from your life of giving?",
    ),
    "q4",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "As we move to our final theme, what do you want Sam to remember?",
    ),
    "q4",
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "Is there anything else you would like to say before we finish?",
    ),
    null,
  );
  assert.equal(
    detectInterviewThemeFromQuestion(
      "How did your faith help you during that time?",
    ),
    null,
  );
});

test("resuming a follow-up does not add another major area", () => {
  const progress = getInterviewProgress("q2", ["q1", "q1", "q2", "q2"]);
  assert.equal(progress.answeredCount, 2);
  assert.equal(progress.otherAreasRemaining, 2);
  assert.equal(nextUnansweredChapterId("q2", ["q1", "q2"]), "q3");
});

test("the final area does not hide an earlier skipped area", () => {
  const progress = getInterviewProgress("q4", ["q1", "q3"]);
  assert.equal(progress.position, 4);
  assert.equal(progress.otherAreasRemaining, 1);
  assert.equal(progress.nextUnansweredChapterId, "q2");
  assert.equal(
    progress.areas.find((area) => area.id === "q2")?.answered,
    false,
  );
});

test("returning to an earlier area preserves the other shared answers", () => {
  const progress = getInterviewProgress("q1", ["q2", "q3", "q4", "unknown"]);
  assert.equal(progress.answeredCount, 3);
  assert.equal(progress.otherAreasRemaining, 0);
  assert.equal(progress.nextUnansweredChapterId, null);
  assert.equal(progress.areas[0].answered, false);
});

test("four shared answers are not a claim of recording or approval", () => {
  const progress = getInterviewProgress("q4", ["q1", "q2", "q3", "q4"]);
  assert.equal(progress.answeredCount, 4);
  assert.equal(progress.nextUnansweredChapterId, null);
  assert.equal("completed" in progress, false);
  assert.equal("approved" in progress, false);
  assert.equal("recordedCount" in progress, false);
});

test("legacy beliefs framing retains the same second area without a faith label", () => {
  assert.equal(interviewChapterTitle("q2", "beliefs"), "Why I give");
  assert.equal(interviewChapterTitle("q2", "faith"), "Why I give");
  assert.equal(interviewChapterTitle("q1"), "Roots of generosity");
  assert.equal(interviewChapterTitle("q3"), "Lives I’ve seen flourish");
});
