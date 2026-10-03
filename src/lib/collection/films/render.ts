import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  selectComposition,
  makeCancelSignal,
} from "@remotion/renderer";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  alignedWords,
  FILM_CLOSER_SECONDS,
  FILM_FPS,
  FILM_INTRO_SECONDS,
  sha256,
  splitNarration,
  validateNarratedFilmPlan,
} from "./plan";
import { narrateFilmChunk } from "./provider";
import type {
  FilmChapter,
  FilmWord,
  NarratedFilmPlan,
  StoryFilmJob,
} from "./types";

const exec = promisify(execFile);
export async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const cachedHash = async (file: string) =>
  fileHash(file).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
export async function privateJson(file: string, value: unknown) {
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, JSON.stringify(value), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, file);
}
async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
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
  const result = JSON.parse(stdout);
  const durationSeconds = Number(result.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error("A film asset has invalid duration.");
  return {
    durationSeconds,
    types: (result.streams ?? []).map(
      (stream: { codec_type: string }) => stream.codec_type,
    ) as string[],
  };
}

type AudioReceipt = {
  scriptSha256: string;
  audioSha256: string;
  durationMs: number;
  words: FilmWord[];
};
export async function prepareNarration(
  job: StoryFilmJob,
  chapter: FilmChapter,
  work: string,
  onProgress: (fraction: number) => Promise<void>,
  assertCurrent: () => Promise<void>,
  provider = narrateFilmChunk,
) {
  await mkdir(work, { recursive: true, mode: 0o700 });
  const audioFile = path.join(work, "narration.wav");
  const receiptFile = path.join(work, "narration.json");
  const existing = await readJson<AudioReceipt>(receiptFile);
  if (
    existing &&
    existing.scriptSha256 === chapter.scriptSha256 &&
    (await cachedHash(audioFile)) === existing.audioSha256
  )
    return { audioFile, ...existing };
  const chunks = splitNarration(chapter.script);
  const words: FilmWord[] = [];
  const filenames: string[] = [];
  let elapsed = 0;
  for (const [index, text] of chunks.entries()) {
    await assertCurrent();
    const filename = `chunk-${String(index).padStart(3, "0")}.mp3`;
    const file = path.join(work, filename);
    const receiptPath = `${file}.json`;
    const scriptSha256 = sha256(text);
    type ChunkReceipt = {
      scriptSha256: string;
      audioSha256: string;
      alignment: Parameters<typeof alignedWords>[0];
    };
    let receipt = await readJson<ChunkReceipt>(receiptPath);
    if (
      !receipt ||
      receipt.scriptSha256 !== scriptSha256 ||
      (await cachedHash(file)) !== receipt.audioSha256
    ) {
      await privateJson(`${file}.request.json`, {
        requestedAt: new Date().toISOString(),
        scriptSha256,
        voiceId: job.voice.voiceId,
        modelId: job.voice.modelId,
        attempt: job.attempts,
      });
      const result = await provider(
        job.voice,
        text,
        chunks[index - 1]?.slice(-500),
        chunks[index + 1]?.slice(0, 500),
      );
      await assertCurrent();
      if (!result.bytes.length)
        throw new Error("Narration returned an empty audio file.");
      if (
        result.alignment.characters.join("").replace(/\s+/g, " ").trim() !==
        text.replace(/\s+/g, " ").trim()
      )
        throw new Error(
          "Narration timing did not cover the complete approved script. The film was not shortened.",
        );
      const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(temporary, result.bytes, { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
      receipt = {
        scriptSha256,
        audioSha256: sha256(result.bytes),
        alignment: result.alignment,
      };
      await privateJson(receiptPath, receipt);
    }
    const duration = await probeFilm(file);
    if (!duration.types.includes("audio"))
      throw new Error("Narration has no audio stream.");
    words.push(...alignedWords(receipt.alignment, elapsed));
    elapsed += duration.durationSeconds * 1000;
    filenames.push(filename);
    await onProgress((index + 1) / chunks.length);
  }
  await assertCurrent();
  await writeFile(
    path.join(work, "audio-concat.txt"),
    filenames.map((filename) => `file '${filename}'`).join("\n"),
    { mode: 0o600 },
  );
  const temporary = path.join(
    work,
    `narration-${randomBytes(8).toString("hex")}.wav`,
  );
  await exec(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      "audio-concat.txt",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      temporary,
    ],
    { cwd: work, timeout: 180000 },
  );
  await rename(temporary, audioFile);
  const audio = await probeFilm(audioFile);
  const receipt: AudioReceipt = {
    scriptSha256: chapter.scriptSha256,
    audioSha256: await fileHash(audioFile),
    durationMs: Math.round(audio.durationSeconds * 1000),
    words,
  };
  await privateJson(receiptFile, receipt);
  return { audioFile, ...receipt };
}

let bundled: Promise<string> | undefined;
export async function renderNarratedFilm(
  plan: NarratedFilmPlan,
  audioFile: string,
  output: string,
  onProgress: (fraction: number) => Promise<void>,
  assertCurrent: () => Promise<void>,
) {
  validateNarratedFilmPlan(plan);
  if ((await fileHash(audioFile)) !== plan.audioSha256)
    throw new Error("Narration audio changed after the plan was prepared.");
  const assets = new Map<string, { file: string; mime: string }>();
  const token = randomBytes(24).toString("hex");
  assets.set(`/${token}/audio`, { file: audioFile, mime: "audio/wav" });
  const font = path.resolve("public/brand/fonts/quicksand-latin.woff2");
  if (await stat(font).catch(() => null))
    assets.set(`/${token}/font`, { file: font, mime: "font/woff2" });
  const closerFile =
    process.env.STORY_FILM_CLOSER_FILE ||
    path.resolve("public/brand/film-closer-v2.mp4");
  let closerSha256: string | undefined;
  if (closerFile) {
    const closer = await probeFilm(closerFile);
    if (
      !closer.types.includes("video") ||
      Math.abs(closer.durationSeconds - 4) > 0.05
    )
      throw new Error(
        "The HyperFrames closer must be a verified four-second video.",
      );
    closerSha256 = await fileHash(closerFile);
    assets.set(`/${token}/closer`, { file: closerFile, mime: "video/mp4" });
  }
  const server = createServer(async (request, response) => {
    const asset = assets.get((request.url || "").split("?")[0]);
    if (!asset || !["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(404).end();
      return;
    }
    try {
      const { size } = await stat(asset.file);
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) {
        response.writeHead(416).end();
        return;
      }
      response.writeHead(range ? 206 : 200, {
        "Content-Type": asset.mime,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (request.method === "HEAD") response.end();
      else
        createReadStream(asset.file, { start, end })
          .on("error", () => response.destroy())
          .pipe(response);
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { cancel, cancelSignal } = makeCancelSignal();
  let progressWrite = Promise.resolve();
  let progressError: unknown;
  let lastProgressAt = 0;
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("The private render server did not start.");
    const origin = `http://127.0.0.1:${address.port}`;
    const inputProps = {
      plan,
      audioSrc: `${origin}/${token}/audio`,
      ...(assets.has(`/${token}/font`)
        ? { fontSrc: `${origin}/${token}/font` }
        : {}),
      ...(closerFile ? { closerSrc: `${origin}/${token}/closer` } : {}),
    };
    bundled ??= bundle({
      entryPoint: path.resolve("video/src/index.tsx"),
    }).catch((error) => {
      bundled = undefined;
      throw error;
    });
    const serveUrl = await bundled;
    const composition = await selectComposition({
      serveUrl,
      id: "NarratedStoryFilm",
      inputProps,
      logLevel: "error",
    });
    await assertCurrent();
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: output,
      overwrite: false,
      concurrency: 2,
      crf: 20,
      logLevel: "error",
      cancelSignal,
      onProgress: ({ progress }) => {
        if (Date.now() - lastProgressAt < 1500 && progress < 1) return;
        lastProgressAt = Date.now();
        progressWrite = progressWrite
          .then(async () => {
            await assertCurrent();
            await onProgress(progress);
          })
          .catch((error) => {
            progressError = error;
            cancel();
          });
      },
    });
    await progressWrite;
    if (progressError) throw progressError;
    await assertCurrent();
    const result = await probeFilm(output);
    const expected =
      FILM_INTRO_SECONDS +
      FILM_CLOSER_SECONDS +
      Math.ceil((plan.audioDurationMs / 1000) * FILM_FPS) / FILM_FPS;
    if (
      !result.types.includes("audio") ||
      !result.types.includes("video") ||
      Math.abs(result.durationSeconds - expected) > 0.2
    )
      throw new Error(
        "The rendered film failed its audio, video, or duration check.",
      );
    const receipt = {
      schemaVersion: 1,
      status: "rendered-awaiting-review",
      planSha256: sha256(JSON.stringify(plan)),
      outputSha256: await fileHash(output),
      durationSeconds: result.durationSeconds,
      narrationKind: "ai_interviewer",
      closerSha256,
      sourceSha256: plan.sourceSha256,
      scriptSha256: plan.scriptSha256,
      audioSha256: plan.audioSha256,
      releaseEligible: false,
    };
    await privateJson(`${output}.result.json`, receipt);
    return receipt;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
