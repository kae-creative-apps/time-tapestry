import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

type Environment = Record<string, string | undefined>;

const sharedSettings = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "SECURITY_HASH_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "COLLECTION_DATA_DIR",
] as const;

/** These messages contain setting names only, never values or provider errors. */
export class WorkerStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerStartupError";
  }
}

export function isHostedFilmWorker(env: Environment = process.env) {
  return (
    ["true", "1"].includes(env.STORY_FILM_WORKER_HOSTED || "") ||
    [
      "RAILWAY_ENVIRONMENT_ID",
      "RAILWAY_PROJECT_ID",
      "RAILWAY_SERVICE_ID",
      "RAILWAY_DEPLOYMENT_ID",
    ].some((name) => Boolean(env[name]?.trim()))
  );
}

function canonicalAppOrigin(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost") ||
      (value !== url.origin && value !== `${url.origin}/`)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new WorkerStartupError(
      "Hosted film worker requires NEXT_PUBLIC_APP_URL to be a canonical public HTTPS origin without credentials, a path, query, or fragment.",
    );
  }
}

/** Pure validation must finish before importing storage or claiming a job. */
export function resolveFilmWorkerConfig(
  env: Environment = process.env,
  cwd = process.cwd(),
) {
  const hosted = isHostedFilmWorker(env);
  if (hosted) {
    const missing = sharedSettings.filter((name) => !env[name]?.trim());
    if (missing.length)
      throw new WorkerStartupError(
        `Hosted film worker configuration is incomplete. Set ${missing.join(", ")} before starting.`,
      );
    if (!path.isAbsolute(env.COLLECTION_DATA_DIR!))
      throw new WorkerStartupError(
        "Hosted film worker requires an absolute COLLECTION_DATA_DIR on its writable volume.",
      );
  }
  const dataDirectory =
    env.COLLECTION_DATA_DIR || path.join(cwd, ".data", "collections");
  return {
    hosted,
    dataDirectory,
    temporaryDirectory: hosted ? path.join(dataDirectory, "tmp") : undefined,
    appOrigin: hosted
      ? canonicalAppOrigin(env.NEXT_PUBLIC_APP_URL!)
      : undefined,
    closerFile:
      env.STORY_FILM_CLOSER_FILE ||
      path.join(cwd, "public", "brand", "film-closer-v2.mp4"),
    fontFile: path.join(
      cwd,
      "public",
      "brand",
      "fonts",
      "quicksand-latin.woff2",
    ),
  };
}

export type FilmWorkerConfig = ReturnType<typeof resolveFilmWorkerConfig>;

export async function checkWorkerDataDirectory(directory: string) {
  const probe = path.join(directory, `.worker-write-check-${randomUUID()}`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const handle = await open(probe, "wx", 0o600);
    try {
      await handle.writeFile("worker startup check\n");
    } finally {
      await handle.close();
    }
    await unlink(probe);
  } catch {
    await unlink(probe).catch(() => {});
    throw new WorkerStartupError(
      "Film worker cannot write to COLLECTION_DATA_DIR. Check the mounted volume and its permissions.",
    );
  }
}

/**
 * Hosted workers always override TMPDIR, TMP, and TEMP with the private
 * COLLECTION_DATA_DIR/tmp directory before loading Remotion or spawning tools.
 * External temp settings and symlinked scratch directories cannot bypass the
 * free-space guard on the data volume. Local development keeps its own settings.
 */
export async function configureWorkerScratchDirectory(
  config: FilmWorkerConfig,
  env: Environment = process.env,
) {
  if (!config.hosted) return;
  const directory = config.temporaryDirectory!;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const scratch = await lstat(directory);
    const data = await stat(config.dataDirectory);
    if (!scratch.isDirectory() || scratch.dev !== data.dev) throw new Error();
    await chmod(directory, 0o700);
    await checkWorkerDataDirectory(directory);
  } catch {
    throw new WorkerStartupError(
      "Hosted film worker requires a private, writable tmp directory on the COLLECTION_DATA_DIR volume. Symlinks and separate scratch filesystems are not allowed.",
    );
  }
  env.TMPDIR = directory;
  env.TMP = directory;
  env.TEMP = directory;
}

const exec = promisify(execFile);

async function readableAsset(file: string, label: string) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) throw new Error();
    await access(file, constants.R_OK);
  } catch {
    throw new WorkerStartupError(
      `Film worker requires the readable, nonempty ${label} asset.`,
    );
  }
}

/** Local checks only. No Redis, Blob, transcription, or narration requests. */
export async function preflightFilmWorker(
  env: Environment = process.env,
  cwd = process.cwd(),
) {
  const config = resolveFilmWorkerConfig(env, cwd);
  // Preserve the existing local workflow, including provider-free manual cuts.
  if (!config.hosted) return config;
  await checkWorkerDataDirectory(config.dataDirectory);
  await configureWorkerScratchDirectory(config, env);
  for (const binary of ["ffmpeg", "ffprobe"]) {
    try {
      await exec(binary, ["-version"], {
        timeout: 10000,
        maxBuffer: 512 * 1024,
      });
    } catch {
      throw new WorkerStartupError(
        `Hosted film worker requires a working ${binary} executable on PATH.`,
      );
    }
  }
  await readableAsset(config.fontFile, "Quicksand font");
  await readableAsset(config.closerFile, "brand closer");
  try {
    const { stdout } = await exec(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
        config.closerFile,
      ],
      { timeout: 10000, maxBuffer: 512 * 1024 },
    );
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string }[];
    };
    const duration = Number(probe.format?.duration);
    if (
      !Number.isFinite(duration) ||
      Math.abs(duration - 4) > 0.05 ||
      !probe.streams?.some((stream) => stream.codec_type === "video")
    )
      throw new Error();
  } catch {
    throw new WorkerStartupError(
      "Hosted film worker requires a valid four-second brand closer video.",
    );
  }
  return config;
}
