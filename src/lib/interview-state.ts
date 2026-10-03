export const MAX_FOLLOW_UPS = 2;

/** The interview and the published story share these four section boundaries. */
export const CHAPTERS = [
  {
    id: "q1",
    title: "People who shaped me",
    question:
      "Tell me about a time someone's kindness changed something for you.",
    followUps: [
      "What do you remember most clearly about that moment?",
      "What did their kindness help you understand?",
    ],
  },
  {
    id: "q2",
    title: "My walk with Jesus",
    question:
      "Tell me about a time following Jesus shaped a choice you made.",
    followUps: [
      "What was happening in your life at the time?",
      "Looking back, what does that decision mean to you now?",
    ],
  },
  {
    id: "q3",
    title: "Learning to live generously",
    question:
      "Tell me about how you sowed into other people's lives through your time and financial giving.",
    followUps: [
      "Would you share a time you chose to give financially to a person, church or ministry?",
      "What do you hope your family learns from the ways you chose to give?",
    ],
  },
  {
    id: "q4",
    title: "What I want you to know",
    question:
      "Looking back at these stories, what would you like the people you care about to carry into their own lives?",
    followUps: [
      "What might that look like in an ordinary day?",
      "Is there something you would like to say directly to them?",
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
    return "Tell me about a time your beliefs shaped a decision you made.";
  }
  const recipientName = context.recipientName?.trim();
  if (chapterId === "q4" && recipientName) {
    return `Looking back at these stories, what would you like ${recipientName} to carry into their own life?`;
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
