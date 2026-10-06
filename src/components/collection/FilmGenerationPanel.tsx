"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutomaticFilmPanel } from "./AutomaticFilmPanel";
import { collectionRequest } from "@/lib/collection/client-request";
import type { CollectionView } from "@/lib/collection/types";

import {
  refreshFilmCompletion,
  filmJobsByMode,
  isActiveFilmStatus as isActive,
  pollFilmStatus,
  type PortalFilmJob,
} from "./film-status";
export type { PortalFilmJob } from "./film-status";
export function FilmGenerationPanel({
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
  const [originalWorking, setOriginalWorking] = useState(false);
  const [rawJob, setRawJob] = useState<PortalFilmJob | null>(null);
  const { original: originalJob } = filmJobsByMode(rawJob);
  const [automaticAvailable, setAutomaticAvailable] = useState<boolean | null>(
    null,
  );
  const [hasSources, setHasSources] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const completedJobs = useRef(new Set<string>());
  const refreshingJobs = useRef(new Set<string>());
  const callbacks = useRef({ onComplete });
  callbacks.current = { onComplete };
  const stopPolling = useRef<(() => void) | null>(null);
  const activeJob = useRef(false);
  const endpoint = `/api/collection/${encodeURIComponent(c.id)}/films?key=${encodeURIComponent(accessKey)}`;
  const scriptSignature = JSON.stringify(
    c.chapters.map((chapter) => [chapter.id, chapter.title, chapter.content]),
  );
  const sourceSignature = JSON.stringify(
    c.chapters.map((chapter) => [chapter.id, chapter.sourceTakeIds]),
  );
  const acceptJob = useCallback((next: PortalFilmJob | null) => {
    setRawJob(next);
    activeJob.current = isActive(next?.status);
    void refreshFilmCompletion(
      next,
      completedJobs.current,
      refreshingJobs.current,
      () => callbacks.current.onComplete(),
    ).catch(() => {
      setError(
        "Your films are ready, but the collection could not refresh. Check your connection, then check progress again. Your films will not be remade.",
      );
    });
  }, []);
  const refresh = useCallback(() => {
    stopPolling.current?.();
    setRevision((value) => value + 1);
  }, []);
  const acceptCreatedJob = useCallback(
    (next: PortalFilmJob | null) => {
      // Ignore any older GET that was already in flight when this job was started.
      stopPolling.current?.();
      acceptJob(next);
      setRevision((value) => value + 1);
    },
    [acceptJob],
  );
  useEffect(() => {
    const stop = pollFilmStatus({
      request: (signal) =>
        collectionRequest(endpoint, { cache: "no-store", signal }),
      initiallyActive: activeJob.current,
      onSnapshot: (result) => {
        setAutomaticAvailable(Boolean(result.automaticAvailable));
        setHasSources(Boolean(result.sources?.length));
        setError(result.error || "");
        acceptJob(result.job || null);
      },
      onError: (cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Film status could not be loaded. Please refresh the status.",
        ),
      onChecking: setChecking,
    });
    stopPolling.current = stop;
    return stop;
  }, [endpoint, revision, scriptSignature, sourceSignature, acceptJob]);
  const active = originalWorking || isActive(originalJob?.status);
  useEffect(() => {
    onActiveChange(active);
    return () => onActiveChange(false);
  }, [active, onActiveChange]);

  return (
    <div className="space-y-6">
      <AutomaticFilmPanel
        collection={c}
        accessKey={accessKey}
        disabled={disabled}
        onWorkingChange={setOriginalWorking}
        job={originalJob}
        available={automaticAvailable}
        hasSources={hasSources}
        checking={checking}
        error={error}
        onError={setError}
        onRefresh={refresh}
        onJobAccepted={acceptCreatedJob}
      />
      {rawJob && rawJob.mode !== "original" && rawJob.status !== "ready" && (
        <p className="rounded-2xl border border-warmgray-200 bg-white p-5 text-base leading-7">
          Films now use your own recorded voice. Continue your interview to
          record any missing answers. Your saved stories are still here.
        </p>
      )}
    </div>
  );
}
