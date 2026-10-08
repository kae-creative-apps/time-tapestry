import { CHAPTERS, type ChapterId } from "../interview-state";
import { stripConversationPerformanceCues } from "./conversation-copy";

export const INTERVIEW_PACING_COPY =
  "We’ll explore four story areas, one question at a time. Follow-up questions depend on what you share. You can pause and return using this same link.";

export function interviewChapterTitle(
  id: ChapterId,
  faithFraming?: "faith" | "beliefs",
) {
  if (id === "q2" && faithFraming === "beliefs") return "Why I give";
  return CHAPTERS.find((chapter) => chapter.id === id)!.title;
}

/** An answer indicates shared words, never recording backup or final approval. */
export function getInterviewProgress(
  activeChapterId: ChapterId,
  answeredChapterIds: readonly string[],
) {
  const answered = new Set(answeredChapterIds);
  const areas = CHAPTERS.map((chapter) => ({
    id: chapter.id,
    active: chapter.id === activeChapterId,
    answered: answered.has(chapter.id),
  }));
  const otherAreas = areas.filter((area) => !area.active && !area.answered);
  return {
    areas,
    position:
      CHAPTERS.findIndex((chapter) => chapter.id === activeChapterId) + 1,
    answeredCount: areas.filter((area) => area.answered).length,
    otherAreasRemaining: otherAreas.length,
    nextUnansweredChapterId: otherAreas[0]?.id ?? null,
  };
}

/** Skipped areas stay available, including when returning from a later area. */
export function nextUnansweredChapterId(
  activeChapterId: ChapterId,
  answeredChapterIds: readonly string[],
): ChapterId | null {
  return getInterviewProgress(activeChapterId, answeredChapterIds)
    .nextUnansweredChapterId;
}

/** Recognize only planned opening questions, never biographical answer keywords. */
export function detectInterviewThemeFromQuestion(
  input: string,
): ChapterId | null {
  const question = stripConversationPerformanceCues(input)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
  if (
    /what made you become so generous/.test(question) ||
    /tell me about someone whose kindness has stayed with you/.test(question) ||
    /tell me about a moment when someone's kindness made a difference in your life/.test(
      question,
    ) ||
    /thinking about the people who shaped your life.{0,100}specific moment of kindness.{0,100}remember clearly/.test(
      question,
    )
  )
    return "q1";
  if (
    /how has your faith shaped why you give/.test(question) ||
    /how your faith has shaped why you give/.test(question) ||
    /what values have guided the way you give/.test(question) ||
    /(?:decision|choice).{0,100}(?:following jesus|guided by (?:your|their) beliefs).{0,100}(?:changed|affected).{0,40}(?:life|better)/.test(
      question,
    ) ||
    /tell me about a decision that mattered to you and what you learned from it/.test(
      question,
    )
  )
    return "q2";
  if (
    /why did you fall in love with (?:these|the) ministries/.test(question) ||
    /why did you fall in love with the ones you give to/.test(question) ||
    /when you think about helping others over the years.{0,90}(?:person|story).{0,40}comes to mind/.test(
      question,
    )
  )
    return "q3";
  if (
    /what do you hope .+carr(?:y|ies) from (?:your|a) life of giving/.test(
      question,
    ) ||
    /what is one thing you hope they carry forward from your story of generosity/.test(
      question,
    ) ||
    /looking back at these stories.{0,150}(?:carry|carried).{0,40}(?:life|lives)/.test(
      question,
    ) ||
    /(?:move|moving) to (?:our|the) final (?:theme|story area).{0,150}(?:know|remember|carry)/.test(
      question,
    )
  )
    return "q4";
  return null;
}
