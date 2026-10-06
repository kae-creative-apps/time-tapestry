"use client";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";

import {
  isActiveFilmStatus as activeStatus,
  type PortalFilmJob,
} from "./film-status";
const labels: Record<string, string> = {
  queued: "Waiting to begin",
  transcribing: "Listening to your recordings",
  matching: "Finding the moments for each story",
  preparing: "Preparing your original recordings",
  narrating: "Previous film version",
  rendering: "Creating your film",
  ready: "Ready to watch",
  failed: "Needs attention",
  stale: "Your stories have changed",
};
export function AutomaticFilmPanel({
  collection: c,
  accessKey,
  disabled,
  onWorkingChange,
  job,
  available,
  hasSources,
  checking,
  error,
  onError,
  onRefresh,
  onJobAccepted,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
  onWorkingChange: (active: boolean) => void;
  job: PortalFilmJob | null;
  available: boolean | null;
  hasSources: boolean;
  checking: boolean;
  error: string;
  onError: (error: string) => void;
  onRefresh: () => void;
  onJobAccepted: (job: PortalFilmJob | null) => void;
}) {
  const [working, setWorking] = useState(false);
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/films?key=${encodeURIComponent(accessKey)}`;
  const active = working || activeStatus(job?.status);
  useEffect(() => {
    onWorkingChange(working);
  }, [working, onWorkingChange]);
  useEffect(() => () => onWorkingChange(false), [onWorkingChange]);
  async function prepare() {
    if (disabled || active || !hasSources) return;
    setWorking(true);
    onError("");
    try {
      const retry =
        job?.mode === "original" &&
        job.preparation === "automatic" &&
        job.status === "failed";
      const body = await collectionRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: retry ? "retry_automatic" : "prepare_automatic",
          ...(retry ? { jobId: job.id } : {}),
          processingApproved: true,
          presentation:
            c.interviews?.some((interview) =>
              interview.segments.some((segment) => segment.kind === "video"),
            ) || c.takes.some((take) => take.kind === "video")
              ? "video"
              : "audio",
        }),
      });
      onJobAccepted(body.job || null);
    } catch (cause) {
      onError(
        cause instanceof Error
          ? cause.message
          : "Your films could not be started.",
      );
    } finally {
      setWorking(false);
    }
  }
  const ownJob = job?.mode === "original";
  const ready =
    c.chapters.length === 4 &&
    c.chapters.every(
      (chapter) =>
        chapter.videoMediaId &&
        chapter.film?.narrationKind === "original_recording",
    );
  return (
    <section
      aria-labelledby="automatic-films-heading"
      className="rounded-2xl border border-sage-200 bg-sage-50 p-5 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-sage-700">
          <AppIcon name="video" size={25} />
        </span>
        <div>
          <p className="text-sm font-medium text-sage-700">
            Your voice. Your story.
          </p>
          <h2
            id="automatic-films-heading"
            className="mt-1 text-2xl font-semibold"
          >
            {ready
              ? "Your four films are ready."
              : active
                ? available === false
                  ? "Your collection is waiting to be prepared."
                  : "We’re putting your stories together."
                : "Four films, made from your interview."}
          </h2>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-base leading-7 text-ink-500">
        {ready
          ? "Watch or listen to each film above, then approve the collection once at the end. The recordings are yours, with titles and a Time Tapestry closing."
          : "We find the moments for each story in your saved recordings, then assemble the films using your own voice. Video recordings keep you on screen. Audio recordings play with the Time Tapestry orb."}
      </p>
      {active && (
        <p role="status" className="mt-4 text-base font-medium">
          {available === false
            ? "The film service is offline. Your saved job will continue when the service is available."
            : `${labels[job?.status || "queued"] || "Preparing your collection"}.`}{" "}
          You can leave this page and return. Your original recordings are kept.
        </p>
      )}
      {ownJob && job && (
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {job.chapters.map((chapter, index) => (
            <li key={chapter.chapterId} className="rounded-xl bg-white p-4">
              <p className="flex items-start justify-between gap-3 text-base font-medium">
                {index + 1}. {chapter.title}
                {chapter.status === "ready" && (
                  <AppIcon name="check" size={19} className="text-sage-700" />
                )}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-500">
                {labels[chapter.status] || chapter.status}
              </p>
            </li>
          ))}
        </ol>
      )}
      <PortalError message={error} />
      {available === null && !error && (
        <p role="status" className="mt-4 text-base leading-7">
          Checking your films…
        </p>
      )}
      {ownJob && job?.status === "failed" && (
        <div className="mt-5 rounded-xl border border-clay-300 bg-white p-4">
          <p className="text-base font-medium">
            Your recordings are saved. The edit needs attention.
          </p>
          <p className="mt-2 text-base leading-7 text-ink-500">
            We could not finish a reliable edit. Nothing has been shared. You
            can retry, and the saved job is available to the support team.
          </p>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer text-sm font-medium">
              Show details
            </summary>
            <p className="text-sm leading-6 text-ink-500">
              {job.error || "The saved job is available to the support team."}
            </p>
          </details>
        </div>
      )}
      {available === false && !active && !ready && (
        <p role="status" className="mt-4 text-base leading-7 text-ink-500">
          Automatic editing is currently offline. Your stories and original
          recordings are saved. You can check again later.
        </p>
      )}
      {!active && !ready && hasSources && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => void prepare()}
            disabled={disabled || available !== true}
            className={portalPrimary}
          >
            {job?.status === "failed"
              ? "Try preparing my films again"
              : "Prepare my films automatically"}
            <AppIcon name="arrowRight" size={18} />
          </button>
          <p className="mt-3 text-sm leading-6 text-ink-500">
            Preparation transcribes your original audio with ElevenLabs to
            locate each story. You will review the finished collection before
            sharing.
          </p>
        </div>
      )}
      {!hasSources && available !== null && (
        <p className="mt-4 text-base leading-7 text-ink-500">
          No original recordings are saved yet. Return to your interview to
          record your answers before preparing the films.
        </p>
      )}
      {(error || available === false) && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          className={`${portalSecondary} mt-4`}
        >
          {checking ? "Checking progress…" : "Check progress again"}
        </button>
      )}
    </section>
  );
}
