export type FilmStatus =
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
  preparation?: string;
  status: FilmStatus;
  error?: string;
  attempts?: number;
  retryAllowed?: boolean;
  retryBlockedReason?: string;
  chapters: {
    chapterId: string;
    title: string;
    status: FilmStatus;
    progress?: number;
    error?: string;
  }[];
};

export type FilmSnapshot = {
  job: PortalFilmJob | null;
  available: boolean;
  automaticAvailable: boolean;
  sources?: unknown[];
  notice?: string;
  error?: string;
};

export const isActiveFilmStatus = (status?: string) =>
  [
    "queued",
    "transcribing",
    "matching",
    "preparing",
    "narrating",
    "rendering",
  ].includes(status || "");

export function filmJobsByMode(job: PortalFilmJob | null) {
  return {
    original: job?.mode === "original" ? job : null,
    ai: job?.mode === "original" ? null : job,
  };
}

/** A ready job is acknowledged once, even after refreshes or mode changes. */
export function claimFilmCompletion(
  job: PortalFilmJob | null,
  completed: Set<string>,
) {
  if (job?.status !== "ready" || completed.has(job.id)) return false;
  completed.add(job.id);
  return true;
}

function isFinishedFilmStatus(status?: string) {
  return status === "ready" || status === "failed" || status === "stale";
}

/** Claim only after collection attachment refresh succeeds, allowing a safe retry. */
export async function refreshFilmCompletion(
  job: PortalFilmJob | null,
  completed: Set<string>,
  inFlight: Set<string>,
  refresh: () => Promise<unknown>,
) {
  if (
    !isFinishedFilmStatus(job?.status) ||
    !job ||
    completed.has(job.id) ||
    inFlight.has(job.id)
  )
    return false;
  inFlight.add(job.id);
  try {
    const result = await refresh();
    if (result === null || result === false)
      throw new Error(
        "This page could not refresh. Check your connection and try again.",
      );
    completed.add(job.id);
    return true;
  } finally {
    inFlight.delete(job.id);
  }
}

/** One sequential status request for either mode; terminal jobs stop polling. */
export function pollFilmStatus({
  request,
  initiallyActive,
  onSnapshot,
  onError,
  onChecking,
  intervalMs = 10000,
}: {
  request: (signal: AbortSignal) => Promise<FilmSnapshot>;
  initiallyActive: boolean;
  onSnapshot: (snapshot: FilmSnapshot) => void;
  onError: (cause: unknown) => void;
  onChecking: (checking: boolean) => void;
  intervalMs?: number;
}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = initiallyActive;
  async function check() {
    onChecking(true);
    try {
      const snapshot = await request(controller.signal);
      if (controller.signal.aborted) return;
      active = isActiveFilmStatus(snapshot.job?.status);
      onSnapshot(snapshot);
    } catch (cause) {
      if (controller.signal.aborted) return;
      onError(cause);
    } finally {
      if (!controller.signal.aborted) {
        onChecking(false);
        if (active) timer = setTimeout(check, intervalMs);
      }
    }
  }
  void check();
  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
