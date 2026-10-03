"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutomaticFilmPanel } from "./AutomaticFilmPanel";
import { AppIcon } from "@/components/icons";
import type { CollectionView } from "@/lib/collection/types";
import { PortalError, portalPrimary, portalSecondary } from "./PortalUI";

type FilmStatus =
  | "queued"
  | "transcribing"
  | "matching"
  | "preparing"
  | "narrating"
  | "rendering"
  | "ready"
  | "failed"
  | "stale";
export type PortalFilmJob = {
  id: string;
  mode?: string;
  status: FilmStatus;
  error?: string;
  chapters: {
    chapterId: string;
    title: string;
    status: FilmStatus;
    progress?: number;
    error?: string;
  }[];
};
const isActive = (status?: string) =>
  [
    "queued",
    "transcribing",
    "matching",
    "preparing",
    "narrating",
    "rendering",
  ].includes(status || "");
const labels: Record<FilmStatus, string> = {
  queued: "Waiting to begin",
  transcribing: "Listening to the recordings",
  matching: "Finding each story",
  preparing: "Preparing the recordings",
  narrating: "Preparing narration",
  rendering: "Creating the film",
  ready: "Ready to review",
  failed: "Needs a retry",
  stale: "Written story changed",
};

export function FilmGenerationPanel({
  collection: c,
  accessKey,
  disabled,
  onActiveChange,
  onComplete,
  writtenOnly,
  onWrittenOnly,
}: {
  collection: CollectionView;
  accessKey: string;
  disabled: boolean;
  onActiveChange: (active: boolean) => void;
  onComplete: () => Promise<unknown>;
  writtenOnly: boolean;
  onWrittenOnly: (value: boolean) => void;
}) {
  const [originalActive, setOriginalActive] = useState(false);
  const [job, setJob] = useState<PortalFilmJob | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [scriptsApproved, setScriptsApproved] = useState(false);
  const [revision, setRevision] = useState(0);
  const previousReady = useRef("");
  const activeJob = useRef(false);
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/films?key=${encodeURIComponent(accessKey)}`;
  const scriptSignature = JSON.stringify(
    c.chapters.map((chapter) => [chapter.id, chapter.title, chapter.content]),
  );
  const previousScript = useRef(scriptSignature);
  useEffect(() => {
    setScriptsApproved(false);
    if (previousScript.current !== scriptSignature) {
      previousScript.current = scriptSignature;
      setRevision((value) => value + 1);
    }
  }, [scriptSignature]);
  const acceptJob = useCallback(
    (next: PortalFilmJob | null) => {
      setJob(next);
      activeJob.current = isActive(next?.status);
      if (next?.status === "ready" && previousReady.current !== next.id) {
        previousReady.current = next.id;
        void onComplete();
      }
    },
    [onComplete],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Film status could not be loaded.");
        if (controller.signal.aborted) return;
        setAvailable(Boolean(result.available));
        setAvailabilityNotice(result.notice || "");
        acceptJob(result.job?.mode === "original" ? null : result.job || null);
        setError(result.error || "");
        if (isActive(result.job?.status)) timer = setTimeout(check, 10000);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Film status could not be loaded. Please refresh the status.",
          );
        if (!controller.signal.aborted && activeJob.current)
          timer = setTimeout(check, 10000);
      }
    }
    void check();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [endpoint, revision, acceptJob]);
  const active = working || isActive(job?.status);
  useEffect(() => {
    onActiveChange(active || originalActive);
    if (active) setShowAi(true);
  }, [active, originalActive, onActiveChange]);
  async function generate(retry = false) {
    if (disabled || active || originalActive || !scriptsApproved) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: retry ? "retry" : "generate",
          ...(retry && job ? { jobId: job.id } : {}),
          scriptsApproved: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Your films could not be started.");
      if (result.job) acceptJob(result.job);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your films could not be started. Please try again.",
      );
    } finally {
      setWorking(false);
    }
  }
  const filmsReady =
    c.chapters.length === 4 &&
    c.chapters.every((chapter) => Boolean(chapter.videoMediaId));
  const consent = (
    <div className="mt-5">
      <label className="flex items-start gap-3 text-base leading-7">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={scriptsApproved}
          disabled={disabled || active || originalActive}
          onChange={(event) => setScriptsApproved(event.target.checked)}
        />
        <span>
          I have read all four complete stories. Use these saved words to create
          films with AI narration.
        </span>
      </label>
      <button
        type="button"
        onClick={() => void generate(job?.status === "failed")}
        disabled={
          disabled ||
          active ||
          originalActive ||
          !scriptsApproved ||
          available !== true
        }
        className={`${filmsReady ? portalSecondary : portalPrimary} mt-5`}
      >
        {working
          ? "Starting AI narration…"
          : job?.status === "failed"
            ? "Retry AI films"
            : filmsReady
              ? "Create new AI narrated films"
              : "Create four AI narrated films"}
        <AppIcon name="video" size={19} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <AutomaticFilmPanel
        collection={c}
        accessKey={accessKey}
        disabled={disabled || active}
        onActiveChange={setOriginalActive}
        onComplete={onComplete}
      />
      <section
        aria-labelledby="sharing-choice-heading"
        className="rounded-2xl border border-warmgray-200 bg-white p-5 sm:p-7"
      >
        <h2 id="sharing-choice-heading" className="text-2xl font-semibold">
          Other ways to share
        </h2>
        <p className="mt-3 text-base leading-7 text-ink-500">
          Prefer a written keepsake? You can share the stories without films.
          Full original recordings stay private; only approved films are shared.
        </p>
        <label className="mt-5 flex items-start gap-3 text-base leading-7">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            checked={writtenOnly}
            disabled={disabled || active || originalActive}
            onChange={(event) => onWrittenOnly(event.target.checked)}
          />
          <span>
            Share written stories without creating new films. I will review each
            story first.
          </span>
        </label>
        {c.chapters.some((chapter) => chapter.videoMediaId) && (
          <p className="mt-3 text-base leading-7 text-ink-500">
            Any film already attached remains part of this collection and must
            also be reviewed before sharing.
          </p>
        )}
        <details
          className="mt-6 rounded-2xl border border-sage-200 bg-sage-50 p-5"
          open={showAi}
          onToggle={(event) => setShowAi(event.currentTarget.open)}
        >
          <summary className="min-h-12 cursor-pointer text-lg font-semibold">
            {active
              ? "AI films are being prepared"
              : "Optional: create films with an AI voice"}
          </summary>
          <div className="mt-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-sage-700">
                <AppIcon name="video" size={25} />
              </span>
              <div>
                <h2 id="film-heading" className="text-2xl font-semibold">
                  {active
                    ? "Your AI narrated films are being prepared."
                    : "AI narration from your written stories"}
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-7 text-ink-500">
                  The AI interviewer narrates your complete saved stories. It is
                  an AI voice, not a recording or imitation of your voice. Your
                  originals remain available, and nothing is shared until you
                  approve.
                </p>
              </div>
            </div>
            {job && (
              <div className="mt-5">
                <p role="status" className="mb-3 text-sm font-medium">
                  {
                    job.chapters.filter((chapter) => chapter.status === "ready")
                      .length
                  }{" "}
                  of 4 films prepared
                  {active
                    ? ". You can leave this page and return to check progress."
                    : "."}
                </p>
                <ol className="grid gap-3 sm:grid-cols-2">
                  {job.chapters.map((chapter, index) => (
                    <li
                      key={chapter.chapterId}
                      className="flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {index + 1}. {chapter.title}
                        </p>
                        <p className="mt-1 text-sm text-ink-500">
                          {labels[chapter.status] || chapter.status}
                        </p>
                        {chapter.error && (
                          <p className="mt-2 text-sm text-oxblood">
                            {chapter.error}
                          </p>
                        )}
                      </div>
                      {chapter.status === "ready" && (
                        <AppIcon
                          name="check"
                          size={19}
                          className="shrink-0 text-sage-700"
                        />
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <PortalError message={error || job?.error || ""} />
            {available === false && !active && (
              <p className="mt-4 text-base leading-7 text-ink-500">
                {availabilityNotice ||
                  "Film creation is currently unavailable. Your stories and recordings are saved. You can return later or choose to share the written stories."}
              </p>
            )}
            {!active && !writtenOnly && consent}
            {!active && writtenOnly && (
              <p className="mt-4 text-base leading-7 text-ink-500">
                You chose written stories. Uncheck that option above if you
                would like to create AI narrated films instead.
              </p>
            )}
            {disabled && !active && (
              <p className="mt-4 text-sm leading-6 text-ink-500">
                Save any open edits and resolve changed answers before creating
                films.
              </p>
            )}
            {(error || available === false) && (
              <button
                type="button"
                className="mt-4 min-h-12 text-base font-medium underline underline-offset-4"
                onClick={() => setRevision((value) => value + 1)}
              >
                Refresh film status
              </button>
            )}
          </div>
        </details>
      </section>
    </div>
  );
}
