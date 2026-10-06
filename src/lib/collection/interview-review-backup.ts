import { getTakeBlob, listLocalTakes } from "./local-takes";
import { readInterviewJournal } from "./interview-journal";
import type { CollectionView } from "./types";

export function interviewSaveNeedsConfirmation(state: {
  hasSavedProgress: boolean;
  journalReady: boolean;
  journalChecking: boolean;
  journalError: boolean;
  pendingWords: boolean;
  savingWords: boolean;
  memoryOnly: boolean;
  queuedWrites?: boolean;
}) {
  return (
    Boolean(state.queuedWrites) ||
    state.pendingWords ||
    state.savingWords ||
    state.memoryOnly ||
    (state.hasSavedProgress &&
      (!state.journalReady || state.journalChecking || state.journalError))
  );
}

/** A review link must not bypass recordings still waiting on this device. */
export async function requireInterviewReviewBackup(collection: CollectionView) {
  if ((await readInterviewJournal(collection.id)).length)
    throw new Error(
      "Some interview updates still need backup. Return to your interview and finish saving before submitting.",
    );
  const local = await listLocalTakes(collection.id);
  for (const take of local) {
    if (take.kind === "text" || take.state === "backed_up") continue;
    const saved =
      collection.takes.some(
        (answer) => answer.id === take.id && Boolean(answer.mediaId),
      ) ||
      collection.interviews?.some((session) =>
        session.segments.some(
          (segment) =>
            segment.localTakeId === take.id && Boolean(segment.mediaId),
        ),
      );
    if (saved) continue;
    // An unreadable draft is not proof of an empty take. Keep submission blocked.
    let bytes: number;
    try {
      bytes = (await getTakeBlob(take)).size;
    } catch (cause) {
      // getTakeBlob emits this only after a successful empty IndexedDB read.
      if (
        cause instanceof Error &&
        cause.message === "No recorded audio or video was saved for this take."
      )
        bytes = 0;
      else
        throw new Error(
          "We could not check a recording saved on this device. Return to your interview to recover it before submitting.",
        );
    }
    if (bytes || take.state === "recording" || (take.durationSeconds ?? 0) > 0)
      throw new Error(
        "A recording still needs backup. Return to your interview and finish saving before submitting. Your earlier recordings are kept.",
      );
  }
}
