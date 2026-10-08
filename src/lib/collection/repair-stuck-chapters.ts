import { interviewResumeState } from "./interview-resume";
import { isMeaningfulInterviewSpeech } from "./interview-speech";
import type { ChapterId } from "../interview-state";
import type { Collection } from "./types";
import {
  mutateCollection,
  readRecord,
  writeRecord,
} from "./store";

/** One production conversation whose answers were all stored on chapter 1. */
export const STUCK_CHAPTER_COLLECTION_ID =
  "b9eafee6-031a-4fe8-9df5-e765039ee7fc";
const STUCK_CHAPTER_SESSION_ID = "fdfaa3d2-3674-4a9f-9c12-2bdd98b35c64";

const USER_CHAPTER_BY_SEQUENCE: Record<number, ChapterId> = {
  1: "q1",
  3: "q1",
  5: "q1",
  7: "q1",
  9: "q1",
  11: "q1",
  13: "q1",
  15: "q1",
  17: "q2",
  19: "q2",
  21: "q2",
  23: "q3",
  25: "q3",
  27: "q3",
  29: "q4",
  31: "q4",
  33: "q4",
};

const AGENT_CHAPTER_BY_SEQUENCE: Record<number, ChapterId> = {
  16: "q2",
  18: "q2",
  20: "q2",
  22: "q3",
  24: "q3",
  26: "q3",
  28: "q4",
  30: "q4",
  32: "q4",
};

/**
 * Move this conversation's already-spoken answers onto chapters 2–4 and stop
 * treating an empty pending retake as the selected answer. Deletes nothing.
 * Returns false when the collection is not this conversation or already repaired.
 */
export function applyStuckChapterAssignment(c: Collection): boolean {
  if (c.id !== STUCK_CHAPTER_COLLECTION_ID) return false;
  const session = c.interviews?.find(
    (item) => item.id === STUCK_CHAPTER_SESSION_ID,
  );
  if (!session || session.excludedTurnIds.length) return false;
  for (const sequence of Object.keys(USER_CHAPTER_BY_SEQUENCE)) {
    const turn = session.turns.find(
      (item) => item.role === "user" && item.sequence === Number(sequence),
    );
    if (!turn || !isMeaningfulInterviewSpeech(turn.text)) return false;
  }

  const previousChapters = session.turns.map((turn) => turn.chapterId);
  const previousSelected = { ...c.selectedTakeIds };
  const previousExplicit = { ...c.explicitTakeSelections };
  let changed = false;
  for (const turn of session.turns) {
    const mapped =
      turn.role === "user"
        ? USER_CHAPTER_BY_SEQUENCE[turn.sequence]
        : turn.role === "agent"
          ? AGENT_CHAPTER_BY_SEQUENCE[turn.sequence]
          : undefined;
    if (!mapped || turn.chapterId === mapped) continue;
    turn.chapterId = mapped;
    changed = true;
  }
  for (const questionId of ["q2", "q3", "q4"] as const) {
    const selectedId = c.selectedTakeIds[questionId];
    if (!selectedId) continue;
    const take = c.takes.find(
      (item) => item.id === selectedId && item.questionId === questionId,
    );
    if (take && isMeaningfulInterviewSpeech(take.text)) continue;
    delete c.selectedTakeIds[questionId];
    if (c.explicitTakeSelections) delete c.explicitTakeSelections[questionId];
    changed = true;
  }
  if (!changed) return false;
  if (interviewResumeState(c).missingChapterIds.length) {
    session.turns.forEach((turn, index) => {
      turn.chapterId = previousChapters[index];
    });
    c.selectedTakeIds = previousSelected;
    c.explicitTakeSelections = previousExplicit;
    return false;
  }
  return true;
}

/** Backup the original rows once, then reassign. No-op for every other gift. */
export async function repairStuckChapterAssignment(
  id: string,
): Promise<boolean> {
  if (id !== STUCK_CHAPTER_COLLECTION_ID) return false;
  let applied = false;
  await mutateCollection(id, async (current) => {
    const next = structuredClone(current);
    if (!applyStuckChapterAssignment(next)) return current;
    const backupId = `backup-${id}`;
    if (!(await readRecord(backupId)))
      await writeRecord(backupId, {
        recordType: "collection-backup",
        reason: "chapter-assignment",
        savedAt: new Date().toISOString(),
        collection: current,
      });
    applied = true;
    return next;
  });
  return applied;
}
