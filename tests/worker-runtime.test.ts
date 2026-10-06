import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  checkWorkerDataDirectory,
  configureWorkerScratchDirectory,
  isHostedFilmWorker,
  preflightFilmWorker,
  resolveFilmWorkerConfig,
  WorkerStartupError,
} from "../src/lib/collection/films/runtime-config";

const configured = (): Record<string, string | undefined> => ({
  STORY_FILM_WORKER_HOSTED: "true",
  KV_REST_API_URL: "https://synthetic-kv.example.org",
  KV_REST_API_TOKEN: "synthetic-kv-secret",
  BLOB_READ_WRITE_TOKEN: "synthetic-blob-secret",
  ELEVENLABS_API_KEY: "synthetic-elevenlabs-secret",
  ELEVENLABS_AGENT_ID: "synthetic-existing-agent",
  SECURITY_HASH_SECRET: "synthetic-hash-secret",
  NEXT_PUBLIC_APP_URL: "https://app.example.org",
  COLLECTION_DATA_DIR: path.join(os.tmpdir(), "synthetic-worker-data"),
});

test("Railway and the explicit hosted flag enable fail-closed startup", () => {
  for (const name of [
    "RAILWAY_ENVIRONMENT_ID",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
    "RAILWAY_DEPLOYMENT_ID",
  ]) {
    const env = { [name]: "synthetic-railway-id" };
    assert.equal(isHostedFilmWorker(env), true);
    assert.throws(() => resolveFilmWorkerConfig(env), WorkerStartupError);
    assert.equal(
      isHostedFilmWorker({ ...env, STORY_FILM_WORKER_HOSTED: "false" }),
      true,
    );
  }
  assert.equal(isHostedFilmWorker({ STORY_FILM_WORKER_HOSTED: "true" }), true);
  assert.equal(isHostedFilmWorker({ STORY_FILM_WORKER_HOSTED: "1" }), true);
  assert.equal(
    isHostedFilmWorker({ STORY_FILM_WORKER_HOSTED: "false" }),
    false,
  );
});

test("empty and partially configured hosted workers reject every required setting", () => {
  assert.throws(
    () => resolveFilmWorkerConfig({ STORY_FILM_WORKER_HOSTED: "true" }),
    /KV_REST_API_URL.*KV_REST_API_TOKEN.*BLOB_READ_WRITE_TOKEN.*ELEVENLABS_API_KEY.*ELEVENLABS_AGENT_ID.*SECURITY_HASH_SECRET.*NEXT_PUBLIC_APP_URL.*COLLECTION_DATA_DIR/,
  );
  for (const name of Object.keys(configured()).filter(
    (name) => name !== "STORY_FILM_WORKER_HOSTED",
  )) {
    for (const missing of [undefined, "", " \t"]) {
      const env = { ...configured(), [name]: missing };
      assert.throws(
        () => resolveFilmWorkerConfig(env),
        (error: unknown) => {
          assert.ok(error instanceof WorkerStartupError);
          assert.match(error.message, new RegExp(name));
          assert.doesNotMatch(error.message, /synthetic-/);
          return true;
        },
      );
    }
  }
});

test("hosted application URLs must be canonical HTTPS origins", () => {
  for (const origin of [
    "not-a-url",
    "http://app.example.org",
    "https://synthetic-user:synthetic-password@app.example.org",
    "https://app.example.org/path",
    "https://app.example.org?synthetic-query=secret",
    "https://app.example.org#synthetic-fragment",
    "https://localhost",
    "https://app.localhost",
    "https://127.0.0.1",
    "https://[::1]",
    " https://app.example.org",
    "https://app.example.org ",
    "https://APP.example.org",
  ])
    assert.throws(
      () =>
        resolveFilmWorkerConfig({
          ...configured(),
          NEXT_PUBLIC_APP_URL: origin,
        }),
      (error: unknown) => {
        assert.ok(error instanceof WorkerStartupError);
        assert.match(error.message, /NEXT_PUBLIC_APP_URL.*HTTPS origin/);
        assert.doesNotMatch(error.message, /synthetic-/);
        return true;
      },
    );
  for (const origin of ["https://app.example.org", "https://app.example.org/"])
    assert.equal(
      resolveFilmWorkerConfig({ ...configured(), NEXT_PUBLIC_APP_URL: origin })
        .appOrigin,
      "https://app.example.org",
    );
});

test("hosted working storage requires an absolute path", () => {
  assert.throws(
    () =>
      resolveFilmWorkerConfig({
        ...configured(),
        COLLECTION_DATA_DIR: ".data/collections",
      }),
    /absolute COLLECTION_DATA_DIR/,
  );
  assert.equal(resolveFilmWorkerConfig(configured()).hosted, true);
});

test("directory preflight makes a private write probe and removes it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "film-worker-write-"));
  try {
    const workingDirectory = path.join(directory, "working");
    await checkWorkerDataDirectory(workingDirectory);
    assert.deepEqual(await readdir(workingDirectory), []);
    const blocked = path.join(directory, "synthetic-private-location");
    await writeFile(blocked, "not a directory");
    await assert.rejects(
      checkWorkerDataDirectory(blocked),
      (error: unknown) => {
        assert.ok(error instanceof WorkerStartupError);
        assert.match(error.message, /cannot write to COLLECTION_DATA_DIR/);
        assert.doesNotMatch(error.message, /synthetic-private-location/);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hosted scratch overrides external temp settings with a private directory on the data volume", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "film-worker-temp-"));
  const env = {
    ...configured(),
    COLLECTION_DATA_DIR: directory,
    TMPDIR: "/synthetic-external-tmpdir",
    TMP: "/synthetic-external-tmp",
    TEMP: "/synthetic-external-temp",
  };
  try {
    const config = resolveFilmWorkerConfig(env);
    await configureWorkerScratchDirectory(config, env);
    const scratch = path.join(directory, "tmp");
    assert.equal(env.TMPDIR, scratch);
    assert.equal(env.TMP, scratch);
    assert.equal(env.TEMP, scratch);
    assert.equal((await stat(scratch)).mode & 0o777, 0o700);
    assert.equal((await stat(scratch)).dev, (await stat(directory)).dev);
    assert.deepEqual(await readdir(scratch), []);
    const { stdout } = await exec(
      process.execPath,
      ["-e", 'process.stdout.write(require("node:os").tmpdir())'],
      { env: { ...env, NODE_ENV: "test" } },
    );
    assert.equal(stdout, scratch);
    // Existing scratch directories are also kept private across restarts.
    await chmod(scratch, 0o755);
    await configureWorkerScratchDirectory(config, env);
    assert.equal((await stat(scratch)).mode & 0o777, 0o700);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hosted scratch rejects a symlink escape without touching its target", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "film-worker-temp-link-"),
  );
  const env = {
    ...configured(),
    COLLECTION_DATA_DIR: path.join(directory, "data"),
    TMPDIR: "/synthetic-external-temp",
  };
  try {
    const external = path.join(directory, "external");
    await mkdir(env.COLLECTION_DATA_DIR);
    await mkdir(external, { mode: 0o755 });
    await symlink(external, path.join(env.COLLECTION_DATA_DIR, "tmp"));
    await assert.rejects(
      configureWorkerScratchDirectory(resolveFilmWorkerConfig(env), env),
      /COLLECTION_DATA_DIR volume.*Symlinks/,
    );
    assert.equal(env.TMPDIR, "/synthetic-external-temp");
    assert.equal((await stat(external)).mode & 0o777, 0o755);
    assert.deepEqual(await readdir(external), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local scratch settings remain unchanged", async () => {
  const env = {
    TMPDIR: "/synthetic-local-tmpdir",
    TMP: "/synthetic-local-tmp",
    TEMP: "/synthetic-local-temp",
  };
  const before = { ...env };
  const config = resolveFilmWorkerConfig(env);
  assert.equal(config.temporaryDirectory, undefined);
  await configureWorkerScratchDirectory(config, env);
  assert.deepEqual(env, before);
});

test("invalid hosted config fails before creating its working directory", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "film-worker-config-"),
  );
  try {
    await assert.rejects(
      preflightFilmWorker({
        ...configured(),
        KV_REST_API_TOKEN: "",
        COLLECTION_DATA_DIR: path.join(directory, "working"),
      }),
      /KV_REST_API_TOKEN/,
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("local development retains its provider-free defaults and relative data path", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "film-worker-local-"));
  try {
    const defaults = await preflightFilmWorker({}, directory);
    assert.equal(defaults.hosted, false);
    assert.equal(
      defaults.dataDirectory,
      path.join(directory, ".data", "collections"),
    );
    assert.equal(defaults.appOrigin, undefined);
    assert.deepEqual(await readdir(directory), []);
    const local = resolveFilmWorkerConfig({
      COLLECTION_DATA_DIR: ".data/local-films",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    assert.equal(local.hosted, false);
    assert.equal(local.dataDirectory, ".data/local-films");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const exec = promisify(execFile);
const projectDirectory = process.cwd();
const requireFromProject = createRequire(
  path.join(projectDirectory, "package.json"),
);
const workerScript = path.join(
  projectDirectory,
  "scripts",
  "run-story-film-worker.ts",
);

test("runner rejects missing hosted config before readiness or a storage heartbeat", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "film-worker-runner-"),
  );
  try {
    await assert.rejects(
      exec(
        process.execPath,
        ["--import", requireFromProject.resolve("tsx"), workerScript, "--once"],
        {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            RAILWAY_ENVIRONMENT_ID: "synthetic-railway-id",
            COLLECTION_DATA_DIR: path.join(directory, "working"),
          },
          timeout: 15000,
        },
      ),
      (error: unknown) => {
        const failure = error as Error & {
          code: number;
          stdout: string;
          stderr: string;
        };
        assert.equal(failure.code, 1);
        assert.match(
          failure.stderr,
          /Hosted film worker configuration is incomplete/,
        );
        assert.doesNotMatch(failure.stdout, /worker is ready/);
        assert.doesNotMatch(failure.stderr, /synthetic-railway-id/);
        return true;
      },
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runner check-only mode exits without polling or creating a heartbeat", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "film-worker-check-"));
  try {
    const { stdout, stderr } = await exec(
      process.execPath,
      ["--import", requireFromProject.resolve("tsx"), workerScript, "--check"],
      {
        cwd: directory,
        env: { PATH: process.env.PATH, NODE_ENV: "test" },
        timeout: 15000,
      },
    );
    assert.match(stdout, /local preflight passed/);
    assert.doesNotMatch(stdout, /worker is ready/);
    assert.equal(stderr, "");
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const signal of ["SIGTERM", "SIGINT"] as const)
  test(`idle worker handles ${signal} without waiting for another poll`, async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "film-worker-stop-"),
    );
    const child = spawn(
      process.execPath,
      ["--import", requireFromProject.resolve("tsx"), workerScript],
      {
        cwd: directory,
        env: { PATH: process.env.PATH, NODE_ENV: "test" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += chunk.toString()));
    const exited = new Promise<{ code: number | null; signal: string | null }>(
      (resolve) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("Synthetic local worker did not become ready.")),
          15000,
        );
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error(`Synthetic local worker exited early: ${errors}`));
        });
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
          if (output.includes("worker is ready")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      // Let the first empty claim settle so the signal interrupts the idle wait.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(child.kill(signal), true);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          exited,
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error("Idle worker did not stop promptly.")),
              2000,
            );
          }),
        ]);
        assert.deepEqual(result, { code: 0, signal: null });
      } finally {
        clearTimeout(deadline);
      }
      assert.match(output, /stopping after its current job/);
      assert.equal(errors, "");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
