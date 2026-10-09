import assert from "node:assert/strict";
import test from "node:test";
import {
  claimFilmCompletion,
  filmJobsByMode,
  pollFilmStatus,
  type FilmSnapshot,
  type PortalFilmJob,
} from "./film-status";

const job = (
  mode: string | undefined,
  status: PortalFilmJob["status"],
  id = "film-1",
): PortalFilmJob => ({
  id,
  mode,
  status,
  chapters: [],
});
const snapshot = (next: PortalFilmJob | null): FilmSnapshot => ({
  job: next,
  available: true,
  automaticAvailable: true,
  sources: [],
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("one raw snapshot routes original, AI, legacy AI and empty jobs to exactly one panel", () => {
  for (const mode of ["original", "ai", undefined]) {
    const current = job(mode, "rendering");
    const views = filmJobsByMode(current);
    assert.equal(views.original, mode === "original" ? current : null);
    assert.equal(views.ai, mode === "original" ? null : current);
  }
  assert.deepEqual(filmJobsByMode(null), { original: null, ai: null });
});

test("ready completion is acknowledged once per job across refreshes and mode changes", () => {
  const completed = new Set<string>();
  assert.equal(
    claimFilmCompletion(job("original", "rendering"), completed),
    false,
  );
  assert.equal(claimFilmCompletion(job("original", "ready"), completed), true);
  assert.equal(claimFilmCompletion(job("original", "ready"), completed), false);
  assert.equal(claimFilmCompletion(null, completed), false);
  assert.equal(
    claimFilmCompletion(job("ai", "ready", "film-2"), completed),
    true,
  );
  assert.equal(claimFilmCompletion(job("original", "ready"), completed), false);
});

for (const mode of ["original", "ai"]) {
  test(`${mode} job polls once each interval, stops at ready and completes once`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let requests = 0;
    let completions = 0;
    const completed = new Set<string>();
    const checking: boolean[] = [];
    const statuses: string[] = [];
    const stop = pollFilmStatus({
      request: async () =>
        snapshot(job(mode, ++requests === 1 ? "rendering" : "ready")),
      initiallyActive: false,
      onSnapshot: (value) => {
        statuses.push(value.job!.status);
        if (claimFilmCompletion(value.job, completed)) completions++;
      },
      onError: (error) => {
        throw error;
      },
      onChecking: (value) => checking.push(value),
    });
    t.after(stop);
    await flush();
    assert.equal(requests, 1);
    t.mock.timers.tick(9999);
    assert.equal(requests, 1);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(requests, 2);
    t.mock.timers.tick(60000);
    await flush();
    assert.equal(requests, 2);
    assert.equal(completions, 1);
    assert.deepEqual(statuses, ["rendering", "ready"]);
    assert.deepEqual(checking, [true, false, true, false]);
  });
}

test("a slow request never overlaps another request, and cancellation ignores its result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve!: (value: FilmSnapshot) => void;
  let requests = 0;
  let received = 0;
  let signal: AbortSignal | undefined;
  const stop = pollFilmStatus({
    request: async (nextSignal) => {
      requests++;
      signal = nextSignal;
      return new Promise<FilmSnapshot>((done) => {
        resolve = done;
      });
    },
    initiallyActive: true,
    onSnapshot: () => {
      received++;
    },
    onError: () => {
      throw new Error("Aborted requests must not surface an error");
    },
    onChecking: () => {},
  });
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(requests, 1);
  stop();
  assert.equal(signal?.aborted, true);
  resolve(snapshot(job("original", "ready")));
  await flush();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(received, 0);
  assert.equal(requests, 1);
});

test("refresh cancellation prevents an older status response from replacing a newer job", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve!: (value: FilmSnapshot) => void;
  const seen: string[] = [];
  const handlers = {
    initiallyActive: true,
    onSnapshot: (value: FilmSnapshot) => seen.push(value.job!.id),
    onError: (error: unknown) => {
      throw error;
    },
    onChecking: () => {},
  };
  const stopOld = pollFilmStatus({
    ...handlers,
    request: () =>
      new Promise<FilmSnapshot>((done) => {
        resolve = done;
      }),
  });
  stopOld();
  const stopNew = pollFilmStatus({
    ...handlers,
    request: async () => snapshot(job("ai", "ready", "new-job")),
  });
  t.after(stopNew);
  await flush();
  resolve(snapshot(job("original", "rendering", "old-job")));
  await flush();
  assert.deepEqual(seen, ["new-job"]);
});

test("temporary status failure retries a known active job and then stops on failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requests = 0;
  let errors = 0;
  const stop = pollFilmStatus({
    request: async () => {
      requests++;
      if (requests === 1) throw new Error("offline");
      return snapshot(job("original", "failed"));
    },
    initiallyActive: true,
    onSnapshot: () => {},
    onError: () => {
      errors++;
    },
    onChecking: () => {},
  });
  t.after(stop);
  await flush();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(requests, 2);
  assert.equal(errors, 1);
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(requests, 2);
});

test("typed-only collections and stale jobs do not create a polling loop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const current of [null, job("ai", "stale")]) {
    let requests = 0;
    const stop = pollFilmStatus({
      request: async () => {
        requests++;
        return snapshot(current);
      },
      initiallyActive: false,
      onSnapshot: () => {},
      onError: (error) => {
        throw error;
      },
      onChecking: () => {},
    });
    await flush();
    t.mock.timers.tick(60000);
    await flush();
    assert.equal(requests, 1);
    stop();
  }
});

test("failed jobs refresh the collection once so attached chapters appear", async () => {
  const { refreshFilmCompletion } = await import("./film-status");
  const complete = new Set<string>();
  const inFlight = new Set<string>();
  const failed = job("original", "failed");
  assert.equal(
    await refreshFilmCompletion(failed, complete, inFlight, async () => ({})),
    true,
  );
  assert.equal(complete.has(failed.id), true);
  assert.equal(
    await refreshFilmCompletion(failed, complete, inFlight, async () => ({})),
    false,
  );
});

test("ready film completion retries after null or failed refresh and prevents overlapping refreshes", async () => {
  const { refreshFilmCompletion } = await import("./film-status");
  const complete = new Set<string>();
  const inFlight = new Set<string>();
  const ready = job("original", "ready");
  await assert.rejects(
    refreshFilmCompletion(ready, complete, inFlight, async () => null),
    /could not refresh/,
  );
  assert.equal(complete.size, 0);
  assert.equal(inFlight.size, 0);
  let resolve!: (value: unknown) => void;
  const pending = refreshFilmCompletion(
    ready,
    complete,
    inFlight,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let duplicated = false;
  assert.equal(
    await refreshFilmCompletion(ready, complete, inFlight, async () => {
      duplicated = true;
      return {};
    }),
    false,
  );
  assert.equal(duplicated, false);
  resolve({ chapters: ["ready"] });
  assert.equal(await pending, true);
  assert.equal(complete.has(ready.id), true);
  assert.equal(
    await refreshFilmCompletion(ready, complete, inFlight, async () => ({})),
    false,
  );
});
