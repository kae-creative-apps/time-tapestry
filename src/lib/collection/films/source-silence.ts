import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SourceSilence } from "./source-cleanup";

const exec = promisify(execFile);

export function parseSourceSilence(
  output: string,
  durationMs: number,
): SourceSilence[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 7200000)
    return [];
  const intervals: SourceSilence[] = [];
  let start: number | undefined;
  for (const match of output.matchAll(
    /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g,
  )) {
    const value = Number(match[2]) * 1000;
    if (!Number.isFinite(value) || value < 0 || value > durationMs + 1)
      return [];
    if (match[1] === "start") {
      if (
        start !== undefined ||
        (intervals.length && value < intervals.at(-1)!.outMs)
      )
        return [];
      start = value;
    } else {
      if (start === undefined || value <= start) return [];
      intervals.push({ inMs: start, outMs: Math.min(durationMs, value) });
      start = undefined;
    }
  }
  // An unfinished interval supplies no evidence about its ending.
  return intervals;
}

/** Read-only waveform analysis. Failed analysis means no automatic pause cuts. */
export async function detectSourceSilence(file: string, durationMs: number) {
  try {
    const { stderr } = await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-nostats",
        "-v",
        "info",
        "-i",
        file,
        "-map",
        "0:a:0",
        "-vn",
        "-af",
        "silencedetect=noise=-45dB:d=1.5",
        "-f",
        "null",
        "-",
      ],
      { timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
    );
    return parseSourceSilence(stderr, durationMs);
  } catch {
    return [];
  }
}
