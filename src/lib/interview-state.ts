export const MAX_FOLLOW_UPS = 2;

/** Optional q2 prompt when someone does not want a faith question. Same section. */
export const NEUTRAL_DECISION_QUESTION =
  "What values have guided the way you give?";

/** The interview and the published story share these four section boundaries. */
export const CHAPTERS = [
  {
    id: "q1",
    title: "Roots of generosity",
    question: "What made you become so generous?",
    followUps: [
      "Who first showed you what a generous life looks like?",
      "When did giving first feel meaningful to you?",
    ],
  },
  {
    id: "q2",
    title: "Why I give",
    question: "How has your faith shaped why you give?",
    followUps: [
      "What moved you to keep giving?",
      "Was there a moment when you knew this was part of your life?",
    ],
  },
  {
    id: "q3",
    title: "Lives I’ve seen flourish",
    question: "Why did you fall in love with these ministries you give to?",
    followUps: [
      "Tell me about a person there whose life you have seen flourish.",
      "Why was it worth it to you?",
    ],
  },
  {
    id: "q4",
    title: "What I hope you carry",
    question:
      "What do you hope your children and grandchildren carry from your life of giving?",
    followUps: [
      "Is there a blessing you would like to leave with them?",
      "What might that look like in their ordinary days?",
    ],
  },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]["id"];

export type QuestionContext = {
  recipientName?: string;
  /** Preserve the framing of older records. New interviews use Christian faith. */
  faithFraming?: "faith" | "beliefs";
};

export function getChapterQuestion(
  chapterId: ChapterId,
  context: QuestionContext = {},
): string {
  const chapter = CHAPTERS.find(({ id }) => id === chapterId);
  if (!chapter) throw new Error(`Unknown interview chapter: ${chapterId}`);

  if (chapterId === "q2" && context.faithFraming === "beliefs") {
    return NEUTRAL_DECISION_QUESTION;
  }
  const recipientName = context.recipientName?.trim();
  if (chapterId === "q4" && recipientName) {
    return `What do you hope ${recipientName} carries from your life of giving?`;
  }
  return chapter.question;
}

// Keep the original question contract for existing interview clients.
export const CORE_QUESTIONS = CHAPTERS.map(({ id, question }) => ({
  id,
  text: question,
}));

/** Compatibility export. Follow-ups belong to a core section, never Q5 or Q6. */
export const OPTIONAL_QUESTIONS: Array<{ id: string; text: string }> = [];

/** An optional direction within an existing follow-up, never a fifth section. */
export const OPTIONAL_SCRIPTURE_FOLLOW_UP =
  "Is there a Scripture that has shaped why you give, if you would like to share it?";

export type InterviewPhase =
  "intro" | "question" | "followup" | "continue_prompt" | "paused" | "finished";

export type InterviewState = {
  phase: InterviewPhase;
  questionIndex: number;
  followUpCount: number;
  // Retain the stored role name for compatibility with existing sessions.
  transcript: Array<{ role: "ai" | "grandparent"; content: string }>;
};

export function initialState(): InterviewState {
  return {
    phase: "intro",
    questionIndex: 0,
    followUpCount: 0,
    transcript: [],
  };
}

export function nextQuestion(state: InterviewState): InterviewState {
  if (state.questionIndex >= CHAPTERS.length - 1) {
    return { ...state, phase: "finished" };
  }
  return {
    ...state,
    questionIndex: state.questionIndex + 1,
    followUpCount: 0,
    phase: "question",
  };
}

/** The fourth section ends the interview without an extra-question loop. */
export function requestContinue(state: InterviewState): InterviewState {
  return nextQuestion(state);
}

export function maybeFollowUp(state: InterviewState): InterviewState {
  if (state.phase === "finished" || state.phase === "paused") return state;
  if (state.followUpCount < MAX_FOLLOW_UPS) {
    return {
      ...state,
      followUpCount: state.followUpCount + 1,
      phase: "followup",
    };
  }
  return requestContinue(state);
}

export function recordGrandparent(
  state: InterviewState,
  content: string,
): InterviewState {
  return {
    ...state,
    transcript: [...state.transcript, { role: "grandparent", content }],
  };
}

export function recordAI(
  state: InterviewState,
  content: string,
): InterviewState {
  return {
    ...state,
    transcript: [...state.transcript, { role: "ai", content }],
  };
}

function normalizeIntent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

/** Match an explicit request, not a remembered event containing "later". */
export function detectPauseIntent(text: string): boolean {
  const value = normalizeIntent(text);
  return /^(?:please\s+)?(?:pause(?:\s+(?:the\s+)?(?:interview|recording))?|(?:can|could)\s+(?:we|i)\s+(?:pause|take a break)|(?:i(?:'d| would) like to\s+)?take a break|(?:i(?:'ll| will)|can i|could i)\s+come back later)(?:\s+please)?$/.test(
    value,
  );
}

/** A story about stopping or being done must not terminate the interview. */
export function detectStopIntent(text: string): boolean {
  const value = normalizeIntent(text);
  return /^(?:please\s+)?(?:stop(?:\s+(?:the\s+)?(?:interview|recording))?|(?:can|could)\s+we\s+stop(?:\s+(?:the\s+)?interview)?|(?:i(?:'m| am)\s+)?(?:done|finished)(?:\s+(?:with\s+)?(?:the\s+)?interview)?|that(?:'s| is) all)(?:\s+please)?$/.test(
    value,
  );
}
