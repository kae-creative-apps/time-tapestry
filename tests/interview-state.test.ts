import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTERS,
  OPTIONAL_QUESTIONS,
  detectPauseIntent,
  detectStopIntent,
  getChapterQuestion,
  initialState,
  maybeFollowUp,
  nextQuestion,
  requestContinue,
} from "../src/lib/interview-state";
import { INTERVIEW_AGENT_PROMPT } from "../src/lib/collection/conversation-agent";
import { interviewerSystemPrompt } from "../src/prompts/interviewer-system";

test("the four core sections finish without an extra-question continuation", () => {
  let state = { ...initialState(), phase: "question" as const };
  for (let index = 0; index < CHAPTERS.length - 1; index += 1) {
    const next = nextQuestion(state);
    assert.equal(next.phase, "question");
    assert.equal(next.questionIndex, index + 1);
    state = { ...next, phase: "question" };
  }
  const finished = requestContinue(state);
  assert.equal(finished.phase, "finished");
  assert.equal(finished.questionIndex, 3);
  assert.equal(OPTIONAL_QUESTIONS.length, 0);
});

test("a third follow-up advances the section and resets its follow-up count", () => {
  const first = maybeFollowUp({ ...initialState(), phase: "question" });
  const second = maybeFollowUp(first);
  const next = maybeFollowUp(second);
  assert.equal(first.followUpCount, 1);
  assert.equal(second.followUpCount, 2);
  assert.equal(next.phase, "question");
  assert.equal(next.questionIndex, 1);
  assert.equal(next.followUpCount, 0);
});

test("the final follow-up cap finishes and paused or finished states stay closed", () => {
  const finished = maybeFollowUp({
    ...initialState(),
    phase: "followup",
    questionIndex: 3,
    followUpCount: 2,
  });
  assert.equal(finished.phase, "finished");
  assert.deepEqual(maybeFollowUp(finished), finished);
  const paused = { ...initialState(), phase: "paused" as const };
  assert.deepEqual(maybeFollowUp(paused), paused);
});

test("remembered events do not accidentally pause or end an interview", () => {
  for (const narrative of [
    "Years later, I understood why she came back to help.",
    "I stopped to buy a meal for someone on my way home.",
    "When I was done at work, I would volunteer.",
    "We used to take a break together after serving lunch.",
    "She reminded me that taking a pause could help.",
  ]) {
    assert.equal(detectPauseIntent(narrative), false, narrative);
    assert.equal(detectStopIntent(narrative), false, narrative);
  }
});

test("explicit interview control requests still work", () => {
  for (const command of [
    "Pause.",
    "Can we take a break?",
    "I will come back later.",
    "Please pause the interview.",
  ]) {
    assert.equal(detectPauseIntent(command), true, command);
  }
  for (const command of [
    "Stop.",
    "Please stop the interview.",
    "I’m done.",
    "Can we stop the interview?",
  ]) {
    assert.equal(detectStopIntent(command), true, command);
  }
});

test("new interviews ask about generosity while older framing and recipient names remain supported", () => {
  assert.equal(CHAPTERS.map((chapter) => chapter.id).join(), "q1,q2,q3,q4");
  assert.equal(getChapterQuestion("q1"), "What made you become so generous?");
  assert.match(getChapterQuestion("q2"), /faith shaped why you give/);
  assert.equal(
    getChapterQuestion("q2", { faithFraming: "beliefs" }),
    "What values have guided the way you give?",
  );
  assert.match(
    getChapterQuestion("q2", { faithFraming: "faith" }),
    /faith shaped why you give/,
  );
  assert.equal(
    getChapterQuestion("q3"),
    "Why did you fall in love with these ministries you give to?",
  );
  assert.equal(CHAPTERS[2].followUps[1], "Why was it worth it to you?");
  assert.match(
    getChapterQuestion("q4", { recipientName: "  Morgan  " }),
    /hope Morgan carries from your life of giving/,
  );
  assert.equal(
    getChapterQuestion("q4", { recipientName: "   " }),
    CHAPTERS[3].question,
  );
  const asked = [
    ...CHAPTERS.flatMap((chapter) => [chapter.question, ...chapter.followUps]),
    getChapterQuestion("q2", { faithFraming: "beliefs" }),
    getChapterQuestion("q4", { recipientName: "Morgan" }),
  ].join("\n");
  assert.doesNotMatch(asked, /\$|\bdollar\b|\bamount\b|how much|gift size/i);
});

test("interviewer instructions ask about generosity and do not request a gift size", () => {
  const prompts = `${INTERVIEW_AGENT_PROMPT}\n${interviewerSystemPrompt}`;
  assert.match(prompts, /What made you become so generous\?/);
  assert.match(prompts, /Why did you fall in love with these ministries you give to\?/);
  assert.match(prompts, /Why was it worth it to you\?/);
  assert.match(prompts, /Never ask how much they gave/);
  assert.doesNotMatch(
    prompts,
    /dollar amount|Amounts are optional|supported financially/i,
  );
});
