"use client";

import React, { useId } from "react";
import type { RecordingBackupProgressState } from "@/lib/collection/recording-backup-progress";

export default function RecordingBackupProgress({
  progress,
  pendingWords = false,
  safeToClose = false,
}: {
  progress: RecordingBackupProgressState;
  pendingWords?: boolean;
  /** The caller must also confirm that transcript and submission work have settled. */
  safeToClose?: boolean;
}) {
  const labelId = useId();
  if (!progress.totalParts && !pendingWords) return null;
  const pending = progress.parts.filter((part) => part.stage !== "backed_up");
  const complete = progress.complete && !pendingWords && safeToClose;
  const waitingForConfirmation =
    progress.finalizing ||
    (progress.complete && (pendingWords || !safeToClose));
  const transfer = pending.find((part) => part.stage === "uploading");
  const confirming = pending.find((part) => part.stage === "confirming");
  const failed = pending.some((part) => part.stage === "failed");
  const transferOnly = pending.length === 1 && transfer;
  const indeterminate =
    waitingForConfirmation ||
    Boolean(confirming && !transfer) ||
    Boolean(transferOnly && transfer.percentage === undefined);
  const barLabel = transferOnly
    ? `Uploading part ${transfer.number}`
    : confirming && !transfer
      ? `Confirming part ${confirming.number} is saved`
      : "Recording parts backed up";
  const status = failed
    ? "A recording needs a retry. Use Retry backup below."
    : waitingForConfirmation
      ? "Confirming your saved interview. Please keep this page open."
      : transfer
        ? `Part ${transfer.number}: uploading${transfer.percentage === undefined ? "" : `, ${transfer.percentage}%`}.`
        : confirming
          ? `Part ${confirming.number}: confirming it is saved.`
          : progress.recording
            ? "Your interview backs up in parts as you record."
            : pendingWords
              ? "Your interview notes are still being saved."
              : pending.length
                ? "Waiting for recording backup."
                : "";

  return (
    <section
      className="rounded-2xl border border-sage/25 bg-sage-50 p-4 text-espresso sm:p-5"
      aria-labelledby={labelId}
    >
      <p id={labelId} className="font-semibold">
        {complete ? "Your recordings are backed up" : "Your recording backup"}
      </p>
      {progress.totalParts > 0 && (
        <>
          <progress
            className="mt-3 h-3 w-full accent-sage-700"
            aria-label={barLabel}
            max={transferOnly ? 100 : progress.totalParts}
            value={
              indeterminate
                ? undefined
                : transferOnly
                  ? transfer.percentage
                  : progress.confirmedParts
            }
          />
          <p className="mt-1 text-sm" aria-live="polite">
            {progress.confirmedParts} of {progress.totalParts} recording{" "}
            {progress.totalParts === 1 ? "part" : "parts"} backed up.
          </p>
        </>
      )}
      {!complete && !progress.recording && (
        <p className="mt-3 font-bold">
          Keep this page open and your computer awake until your interview is
          fully saved.
        </p>
      )}
      {complete && (
        <p className="mt-2 text-base">You can safely close this page.</p>
      )}
      {status && <p className="mt-2 text-sm">{status}</p>}
    </section>
  );
}
