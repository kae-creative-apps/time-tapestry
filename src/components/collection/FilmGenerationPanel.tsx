"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";
import { hasChapterPlayback } from "@/lib/audio/playback-types";
import { AppIcon } from "@/components/icons";
import { portalPrimary, portalSecondary } from "./PortalUI";
import {
  refreshFilmCompletion,
  isActiveFilmStatus,
  pollFilmStatus,
  type PortalFilmJob,
} from "./film-status";
export type { PortalFilmJob } from "./film-status";

type Props = {
  collection: CollectionView;
  accessKey: string;
  disabled?: boolean;
  onActiveChange?: (active: boolean) => void;
  onComplete: () => Promise<unknown>;
};
type PreparationSnapshot = {
  job: PortalFilmJob | null;
  workerAvailable: boolean;
  ready?: boolean;
};

const statusLabel: Record<string, string> = {
  queued: "Waiting to begin",
  transcribing: "Finding your spoken words",
  matching: "Finding this story in your recording",
  preparing: "Preparing your story",
  rendering: "Preparing playback",
  ready: "Ready",
  failed: "Needs attention",
  stale: "Your recording has changed",
};

/** Owner-only controls. Playback preparation and optional MP4 export use separate jobs. */
function PreparationPanel({
  collection: c,
  accessKey,
  disabled = false,
  onActiveChange,
  onComplete,
  exportOnly = false,
}: Props & { exportOnly?: boolean }) {
  const [job, setJob] = useState<PortalFilmJob | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const completed = useRef(new Set<string>());
  const refreshing = useRef(new Set<string>());
  const callbacks = useRef({ onComplete });
  callbacks.current = { onComplete };
  const stopPolling = useRef<(() => void) | null>(null);
  const activeJob = useRef(false);
  const pendingMutation = useRef(false);
  const alive = useRef(true);
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/${exportOnly ? "exports" : "playback"}?key=${encodeURIComponent(accessKey)}`;
  const sourceSignature = JSON.stringify(
    c.chapters.map((chapter) => [
      chapter.id,
      chapter.sourceTakeIds,
      chapter.playback?.outputSha256,
    ]),
  );
  const allExports =
    c.chapters.length === 4 &&
    c.chapters.every(
      (chapter) =>
        hasChapterPlayback(chapter) && chapter.playback?.exportMediaId,
    );
  const active = working || isActiveFilmStatus(job?.status);
  const acceptJob = useCallback((next: PortalFilmJob | null) => {
    setJob(next);
    activeJob.current = isActiveFilmStatus(next?.status);
    void refreshFilmCompletion(
      next,
      completed.current,
      refreshing.current,
      () => callbacks.current.onComplete(),
    ).catch(() => {
      if (alive.current)
        setError(
          "This page could not refresh. Check your connection, then check progress again. Your stories will not be remade.",
        );
    });
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (c.role !== "owner" || pendingMutation.current) return;
    const stop = pollFilmStatus({
      request: async (signal) => {
        const result = await collectionRequest<PreparationSnapshot>(endpoint, {
          signal,
        });
        return {
          ...result,
          available: result.workerAvailable,
          automaticAvailable: result.workerAvailable,
        };
      },
      initiallyActive: activeJob.current,
      onSnapshot: (result) => {
        setAvailable(result.available);
        // Preserve a failed POST explanation when the subsequent status check
        // finds no saved request. An active/ready durable job resolves ambiguity.
        if (
          result.job &&
          (isActiveFilmStatus(result.job.status) ||
            result.job.status === "ready")
        )
          setError("");
        acceptJob(result.job);
      },
      onError: (cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Progress could not be loaded. Please check again.",
        ),
      onChecking: setChecking,
    });
    stopPolling.current = stop;
    return stop;
  }, [c.role, endpoint, revision, sourceSignature, acceptJob]);
  useEffect(() => {
    onActiveChange?.(active);
    return () => onActiveChange?.(false);
  }, [active, onActiveChange]);

  async function request() {
    if (disabled || active || pendingMutation.current || available !== true)
      return;
    if (job?.status === "failed" && job.retryAllowed !== true) return;
    pendingMutation.current = true;
    stopPolling.current?.();
    setWorking(true);
    setError("");
    try {
      const result = await collectionRequest<{ job: PortalFilmJob }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            job?.status === "failed"
              ? "retry"
              : exportOnly
                ? "request"
                : "prepare",
          ...(job?.status === "failed" ? { jobId: job.id } : {}),
          ...(!exportOnly ? { processingApproved: true } : {}),
        }),
      });
      if (alive.current) acceptJob(result.job);
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "This could not be started. Your recordings remain saved.",
        );
    } finally {
      pendingMutation.current = false;
      if (alive.current) {
        setWorking(false);
        // A timed-out POST may already be saved. Read the durable job before
        // offering another action, and ignore all older in-flight status reads.
        setRevision((value) => value + 1);
      }
    }
  }
  function refresh() {
    stopPolling.current?.();
    setError("");
    setRevision((value) => value + 1);
  }
  if (c.role !== "owner") return null;
  const failed = job?.status === "failed";
  const ready = exportOnly ? allExports : job?.status === "ready";
  const canStart =
    !active &&
    !ready &&
    job?.status !== "ready" &&
    (!failed || job.retryAllowed === true);
  return (
    <section
      className="rounded-2xl border border-taupe/30 bg-paper p-5 sm:p-6"
      aria-label={exportOnly ? "Downloadable films" : "Story preparation"}
    >
      <h3 className="text-xl font-semibold">
        {exportOnly
          ? "Keep a downloadable film"
          : "Your four stories, in your own voice"}
      </h3>
      <p className="mt-3 text-base leading-7 text-ink-600">
        {exportOnly
          ? "Your stories already play here. You can also create four MP4 files to save on your own device. They use the same original voice and spoken words."
          : "We prepare each story from your saved recording, with your own voice and words that follow along. You can leave this page while preparation runs."}
      </p>
      {ready ? (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 text-base font-medium"
        >
          <AppIcon name="check" size={20} />
          {exportOnly
            ? "Your films are ready. Open a story above to download its MP4."
            : "Your stories are ready."}
        </p>
      ) : job ? (
        <div className="mt-4">
          <p role="status" className="text-base font-medium">
            {working
              ? "Saving your request…"
              : statusLabel[job.status] || "Preparing your stories"}
          </p>
          {job.chapters.length > 0 && (
            <ol className="mt-3 space-y-2">
              {job.chapters.map((chapter, index) => (
                <li
                  key={chapter.chapterId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-white px-4 py-3 text-base"
                >
                  <span>
                    {index + 1}. {chapter.title}
                  </span>
                  <span className="text-sm text-ink-600">
                    {statusLabel[chapter.status] || "Preparing"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {failed && (
            <p className="mt-3 text-base leading-7">
              {job.retryAllowed === true
                ? "We'll prepare the missing chapter from your saved recording. Your original interview is kept."
                : job.retryBlockedReason ||
                  job.error ||
                  "These stories need checking. Your original recordings remain saved."}
            </p>
          )}
        </div>
      ) : null}
      {available === false && !ready && (
        <p className="mt-4 text-base leading-7">
          Preparation is temporarily unavailable. Your recordings are saved.
          Check progress again before continuing.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-clay-50 p-4 text-base leading-7"
        >
          {error}
        </p>
      )}
      {!ready && (
        <div className="mt-5 flex flex-wrap gap-3">
          {canStart && (
            <button
              type="button"
              className={portalPrimary}
              disabled={disabled || working || checking || available !== true}
              onClick={() => void request()}
            >
              {failed
                ? "Try this chapter again"
                : exportOnly
                  ? "Create downloadable films (MP4)"
                  : "Prepare my four stories"}
            </button>
          )}
          <button
            type="button"
            className={portalSecondary}
            disabled={working || checking}
            onClick={refresh}
          >
            {checking ? "Checking progress…" : "Check progress"}
          </button>
        </div>
      )}
      {ready && error && (
        <button
          type="button"
          className={`${portalSecondary} mt-4`}
          disabled={checking}
          onClick={refresh}
        >
          Refresh my stories
        </button>
      )}
    </section>
  );
}

export function FilmGenerationPanel(props: Props) {
  return <PreparationPanel {...props} />;
}

export function StoryExportPanel(props: Omit<Props, "onActiveChange">) {
  return <PreparationPanel {...props} exportOnly />;
}
