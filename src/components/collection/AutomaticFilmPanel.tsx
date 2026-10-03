"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/icons";
import type { CollectionView } from "@/lib/collection/types";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";

type Job = {
  id: string;
  mode?: string;
  preparation?: string;
  status: string;
  error?: string;
  chapters: {
    chapterId: string;
    title: string;
    status: string;
    progress?: number;
    error?: string;
  }[];
};
const activeStatus = (status?: string) =>
  [
    "queued",
    "transcribing",
    "matching",
    "preparing",
    "narrating",
    "rendering",
  ].includes(status || "");
const labels: Record<string, string> = {
  queued: "Waiting to begin",
  transcribing: "Listening to your recordings",
  matching: "Finding the moments for each story",
  preparing: "Preparing your original recordings",
  narrating: "Preparing narration",
  rendering: "Creating your film",
  ready: "Ready to watch",
  failed: "Needs attention",
  stale: "Your stories have changed",
};
export function AutomaticFilmPanel({
  collection: c,
  accessKey,
  disabled,
  onActiveChange,
  onComplete,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
  onActiveChange: (active: boolean) => void;
  onComplete: () => Promise<unknown>;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [hasSources, setHasSources] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const lastReady = useRef("");
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/films?key=${encodeURIComponent(accessKey)}`;
  const accept = useCallback(
    (next: Job | null) => {
      setJob(next);
      if (next?.status === "ready" && lastReady.current !== next.id) {
        lastReady.current = next.id;
        void onComplete();
      }
    },
    [onComplete],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "We could not check film progress.");
        if (controller.signal.aborted) return;
        accept(body.job || null);
        setAvailable(Boolean(body.automaticAvailable));
        setHasSources(Boolean(body.sources?.length));
        setError("");
        if (activeStatus(body.job?.status)) timer = setTimeout(check, 8000);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "We could not check film progress.",
          );
          timer = setTimeout(check, 15000);
        }
      }
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [endpoint, revision, accept]);
  const active = working || activeStatus(job?.status);
  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);
  async function prepare() {
    if (disabled || active || !hasSources) return;
    setWorking(true);
    setError("");
    try {
      const retry =
        job?.mode === "original" &&
        job.preparation === "automatic" &&
        job.status === "failed";
      const response = await fetch(endpoint, {
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
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Your films could not be started.");
      accept(body.job || null);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
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
          ? "Watch each film with its written story above. The recordings are yours, with titles and a Time Tapestry closing."
          : "We find the moments for each story in your saved recordings, then assemble the films automatically. There are no clips to trim or files to arrange."}
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
              {job.error ||
                "Open the admin portal to review the processing job."}
            </p>
          </details>
        </div>
      )}
      {available === false && !active && !ready && (
        <p role="status" className="mt-4 text-base leading-7 text-ink-500">
          Automatic editing is currently offline. Your stories are saved. Film
          processing needs to be connected before your collection can be
          completed.
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
          No original recordings are saved yet. You can continue your interview,
          or choose to share the written stories below.
        </p>
      )}
      {(error || available === false) && (
        <button
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          className={`${portalSecondary} mt-4`}
        >
          Check progress again
        </button>
      )}
    </section>
  );
}
