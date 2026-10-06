"use client";
import React, { type ReactNode } from "react";
import type { LocalTake } from "@/lib/collection/local-takes";

export function RecoveredRecordingPrompt({
  take,
  disabled,
  onKeep,
  onLater,
  children,
}: {
  take: LocalTake;
  disabled?: boolean;
  onKeep: () => void;
  onLater: () => void;
  children: ReactNode;
}) {
  const date = new Date(take.createdAt);
  const when = Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "an earlier session";
  return (
    <section
      className="space-y-4 rounded-lg border border-sage-300 bg-paper-50 p-5"
      aria-label="Recovered recording"
    >
      <h3 className="text-xl">
        We recovered your recording from {when}. Would you like to keep it?
      </h3>
      <p className="text-sm leading-6 text-ink-500">
        Preview the saved portion before you choose. If the device interrupted
        recording, the final few moments may be missing.
      </p>
      {children}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onKeep}
          className="min-h-12 rounded-md bg-oxblood px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          Keep recording
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onLater}
          className="min-h-12 rounded-md border border-warmgray-300 px-5 py-3 text-ink-700 disabled:opacity-50"
        >
          Later
        </button>
      </div>
      <p className="text-sm text-ink-500">
        Choosing Later keeps the saved recording on this device.
      </p>
    </section>
  );
}
