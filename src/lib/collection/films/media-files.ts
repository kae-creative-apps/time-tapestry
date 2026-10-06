import { createReadStream } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Shared server/worker file operations. This module must not import renderers or their bundlers. */
export async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function privateJson(file: string, value: unknown) {
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, file);
}

export async function probeFilm(file: string) {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      file,
    ],
    { timeout: 60000 },
  );
  const result = JSON.parse(stdout) as {
    format?: { duration?: unknown };
    streams?: Array<{ codec_type?: unknown }>;
  };
  const durationSeconds = Number(result.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("A film asset has invalid duration.");
  return {
    durationSeconds,
    types: (result.streams ?? []).flatMap((stream) =>
      typeof stream.codec_type === "string" ? [stream.codec_type] : [],
    ),
  };
}
