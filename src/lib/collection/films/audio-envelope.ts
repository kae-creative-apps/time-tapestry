import { spawn } from "node:child_process";
import path from "node:path";
import type { AudioEnvelope } from "../../film-audio-envelope";

const ENVELOPE_RATE = 30;
const PCM_RATE = 12000;
const SAMPLES_PER_WINDOW = PCM_RATE / ENVELOPE_RATE;
const MAX_DURATION_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_MS = 180000;
const SILENCE_RMS = 0.001;

/** Decode only to stdout. Keep a 30 Hz RMS envelope, never the full PCM audio.
 * Duration is a bound from the already-verified render plan. Without one, fail
 * if decoded audio exceeds the existing two-hour original-source limit.
 * Quiet windows below -60 dBFS stay silent; other levels are scaled to this
 * recording's loudest window. No audio is modified or written to disk. */
export async function extractAudioEnvelope(
  file: string,
  durationMs?: number,
): Promise<AudioEnvelope> {
  if (
    durationMs !== undefined &&
    (!Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > MAX_DURATION_MS)
  )
    throw new Error(
      "Audio envelope duration must be between zero and two hours.",
    );
  if (!file || file.includes("\0"))
    throw new Error("Audio envelope needs a local audio file.");
  const maximumSamples = Math.ceil(
    ((durationMs ?? MAX_DURATION_MS) * PCM_RATE) / 1000,
  );
  const levels = await new Promise<number[]>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        path.resolve(file),
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        String(PCM_RATE),
        ...(durationMs === undefined ? [] : ["-t", String(durationMs / 1000)]),
        "-c:a",
        "pcm_s16le",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const rms: number[] = [];
    let count = 0;
    let windowCount = 0;
    let sumSquares = 0;
    let pendingByte: number | undefined;
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill("SIGKILL");
    };
    const timer = setTimeout(
      () => stop("Audio envelope analysis exceeded its time limit."),
      TIMEOUT_MS,
    );
    const sample = (value: number) => {
      if (++count > maximumSamples) {
        stop("Audio envelope analysis exceeded its decoded-audio limit.");
        return;
      }
      const amplitude = value / 32768;
      sumSquares += amplitude * amplitude;
      if (++windowCount === SAMPLES_PER_WINDOW) {
        rms.push(Math.sqrt(sumSquares / windowCount));
        sumSquares = 0;
        windowCount = 0;
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (failure) return;
      let offset = 0;
      if (pendingByte !== undefined && chunk.length) {
        const value = pendingByte | (chunk[0] << 8);
        sample(value > 32767 ? value - 65536 : value);
        pendingByte = undefined;
        offset = 1;
      }
      for (; offset + 1 < chunk.length && !failure; offset += 2)
        sample(chunk.readInt16LE(offset));
      if (!failure && offset < chunk.length) pendingByte = chunk[offset];
    });
    // Drain stderr without retaining decoder output or leaking private paths.
    child.stderr.resume();
    child.once("error", () => {
      failure ??= new Error("Audio envelope analysis could not start ffmpeg.");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0 || pendingByte !== undefined || count === 0)
        return reject(
          new Error("Audio envelope analysis could not decode the audio."),
        );
      if (windowCount) rms.push(Math.sqrt(sumSquares / windowCount));
      resolve(rms);
    });
  });
  let peak = SILENCE_RMS;
  for (const level of levels) peak = Math.max(peak, level);
  return {
    sampleRate: ENVELOPE_RATE,
    levels: levels.map((level) =>
      level <= SILENCE_RMS
        ? 0
        : Math.min(1, Math.sqrt((level - SILENCE_RMS) / (peak - SILENCE_RMS))),
    ),
  };
}
