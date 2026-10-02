/** Optional preprocessing worker. No change to the words, timing or identity of a speaker. */
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : fallback;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return value;
};
async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function duration(file: string) {
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    file,
  ]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("Audio has no valid duration");
  return value;
}

async function main() {
  const input = await realpath(path.resolve(option("--input")));
  const output = path.resolve(option("--output"));
  const method = option("--method", "ffmpeg-cleanup");
  if (!["ffmpeg-cleanup", "elevenlabs-isolation"].includes(method))
    throw new Error("Unknown audio method");
  if (input === output) throw new Error("Never overwrite the original");
  if (path.extname(output).toLowerCase() !== ".wav")
    throw new Error("Output must be a new .wav file");
  if (
    method === "elevenlabs-isolation" &&
    !args.includes("--allow-external-processing")
  )
    throw new Error(
      "ElevenLabs uploads require the explicit --allow-external-processing flag and recorded user consent",
    );
  if (method === "elevenlabs-isolation" && !process.env.ELEVENLABS_API_KEY)
    throw new Error("ELEVENLABS_API_KEY is not configured");
  const archiveRoot = path.resolve(option("--archive-root", "video/archive"));
  await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const sourceHash = await hashFile(input);
  const archivePath = path.join(archiveRoot, sourceHash + path.extname(input));
  try {
    await copyFile(input, archivePath, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if ((await hashFile(archivePath)) !== sourceHash)
    throw new Error("Original archive hash verification failed");
  const work = await mkdtemp(path.join(path.dirname(output), ".audio-work-"));
  try {
    const extracted = path.join(work, "extracted.wav");
    const processed = path.join(work, "processed.wav");
    await exec("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-i",
      input,
      "-vn",
      "-map",
      "0:a:0",
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      extracted,
    ]);
    const sourceDuration = await duration(extracted);
    let audioInput = extracted;
    if (method === "elevenlabs-isolation") {
      // This guard is a local resource limit, not a claimed provider upload limit.
      if ((await stat(extracted)).size > 100 * 1024 * 1024)
        throw new Error(
          "Process a shorter source segment for external isolation; local guard is 100 MB",
        );
      const form = new FormData();
      form.append(
        "audio",
        new Blob([new Uint8Array(await readFile(extracted))], {
          type: "audio/wav",
        }),
        "interview.wav",
      );
      const response = await fetch(
        "https://api.elevenlabs.io/v1/audio-isolation",
        {
          method: "POST",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body: form,
          signal: AbortSignal.timeout(180000),
        },
      );
      if (!response.ok)
        throw new Error(
          `ElevenLabs isolation failed with HTTP ${response.status}; the original is preserved`,
        );
      if (!(response.headers.get("content-type") || "").includes("audio/"))
        throw new Error("ElevenLabs did not return an audio response");
      audioInput = path.join(work, "isolated.audio");
      await writeFile(
        audioInput,
        new Uint8Array(await response.arrayBuffer()),
        { flag: "wx", mode: 0o600 },
      );
    }
    // Conventional signal processing is not AI enhancement. No silence is removed.
    const filter =
      method === "ffmpeg-cleanup"
        ? "highpass=f=70,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"
        : "loudnorm=I=-16:TP=-1.5:LRA=11";
    await exec("ffmpeg", [
      "-nostdin",
      "-v",
      "error",
      "-i",
      audioInput,
      "-vn",
      "-af",
      filter,
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      processed,
    ]);
    const processedDuration = await duration(processed);
    if (Math.abs(sourceDuration - processedDuration) > 0.1)
      throw new Error(
        "Processed audio changed duration by over 100ms; use the original until reviewed",
      );
    await copyFile(processed, output, constants.COPYFILE_EXCL);
    const result = {
      method,
      output,
      sha256: await hashFile(output),
      durationMs: Math.round(processedDuration * 1000),
      sourceSha256: sourceHash,
      archivePath,
      originalPreserved: true,
      externalProcessing: method === "elevenlabs-isolation",
      humanListeningReview: "pending",
      note: "Compare processed audio with the original before accepting it. Noise reduction can damage speech. This is not voice cloning or replacement.",
    };
    await writeFile(
      output + ".result.json",
      JSON.stringify(result, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `Audio processing failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
