export const CORE_QUESTIONS = [
  {
    id: 'q1',
    text: 'What is a story from your life you find yourself thinking about often?'
  },
  {
    id: 'q2',
    text: 'When did you first learn that giving mattered?'
  },
  {
    id: 'q3',
    text: 'What causes do you believe in enough to keep supporting?'
  },
  {
    id: 'q4',
    text: 'Is there something you hope the person who receives this understands about the way you have lived?'
  }
];

export const OPTIONAL_QUESTIONS = [
  {
    id: 'q5',
    text: 'What is a small, ordinary generosity that has stayed with you?'
  },
  {
    id: 'q6',
    text: 'What would it mean to you to see them carry this forward in their own way?'
  }
];

export type InterviewPhase =
  | 'intro'
  | 'question'
  | 'followup'
  | 'continue_prompt'
  | 'paused'
  | 'finished';

export type InterviewState = {
  phase: InterviewPhase;
  questionIndex: number;
  followUpCount: number;
  transcript: Array<{ role: 'ai' | 'grandparent'; content: string }>;
};

export function initialState(): InterviewState {
  return {
    phase: 'intro',
    questionIndex: 0,
    followUpCount: 0,
    transcript: []
  };
}

export function nextQuestion(state: InterviewState): InterviewState {
  const allQuestions = [...CORE_QUESTIONS, ...OPTIONAL_QUESTIONS];
  if (state.questionIndex >= allQuestions.length - 1) {
    return { ...state, phase: 'finished' };
  }
  return {
    ...state,
    questionIndex: state.questionIndex + 1,
    followUpCount: 0,
    phase: 'question'
  };
}

export function requestContinue(state: InterviewState): InterviewState {
  if (state.questionIndex === CORE_QUESTIONS.length - 1) {
    return { ...state, phase: 'continue_prompt' };
  }
  return nextQuestion(state);
}

export function maybeFollowUp(state: InterviewState): InterviewState {
  if (state.followUpCount < 2) {
    return { ...state, followUpCount: state.followUpCount + 1, phase: 'followup' };
  }
  return requestContinue(state);
}

export function recordGrandparent(
  state: InterviewState,
  content: string
): InterviewState {
  return {
    ...state,
    transcript: [...state.transcript, { role: 'grandparent', content }]
  };
}

export function recordAI(state: InterviewState, content: string): InterviewState {
  return {
    ...state,
    transcript: [...state.transcript, { role: 'ai', content }]
  };
}

export function detectPauseIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('pause') ||
    lower.includes('take a break') ||
    lower.includes('come back') ||
    lower.includes('later')
  );
}

export function detectStopIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('stop') ||
    lower.includes('done') ||
    lower.includes('that is all') ||
    lower.includes("that's all")
  );
}
