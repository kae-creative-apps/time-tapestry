import React from "react";
import type { InterviewTurn } from "@/lib/collection/types";

/** Transcript is a reading aid. Changes to an answer require another recording. */
export function LiveTranscriptReview({
  turn,
  included,
  onRerecord,
  busy,
}: {
  turn: InterviewTurn;
  included: boolean;
  onRerecord: () => void;
  busy: boolean;
}) {
  return (
    <article className="border-b border-warmgray-300 py-5">
      {!included && (
        <p className="mb-3 text-base text-ink-700">
          This earlier answer is not selected. Its original recording stays
          saved.
        </p>
      )}
      <details>
        <summary className="min-h-12 cursor-pointer py-3 text-base font-medium">
          Read transcript
          {turn.chapterId ? ` for part ${turn.chapterId.slice(1)}` : ""}
        </summary>
        <p className="whitespace-pre-wrap text-lg leading-8 text-espresso">
          {turn.text}
        </p>
      </details>
      {turn.chapterId && (
        <button
          type="button"
          disabled={busy}
          onClick={onRerecord}
          className="mt-3 min-h-12 rounded-xl border border-espresso/20 px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          Record this part again
        </button>
      )}
    </article>
  );
}
