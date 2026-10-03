/** Local synthetic integration fixture. Never reads a family collection. */
import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { syntheticFilmCollection } from "../tests/film-fixture";
const exec = promisify(execFile);
loadEnvConfig(process.cwd());
process.env.COLLECTION_DATA_DIR = path.resolve(".data/original-automatic-qa");
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL",
  "BLOB_READ_WRITE_TOKEN",
])
  delete process.env[key];
async function main() {
  const store = await import("../src/lib/collection/store");
  const jobs = await import("../src/lib/collection/films/jobstore");
  const { processFilmJob } = await import("../src/lib/collection/films/worker");
  const { probeFilm, fileHash } =
    await import("../src/lib/collection/films/render");
  await mkdir(store.dataRoot, { recursive: true, mode: 0o700 });
  await mkdir(path.join(store.dataRoot, "media"), {
    recursive: true,
    mode: 0o700,
  });
  const pointer = path.join(store.dataRoot, "fixture.json");
  let fixture:
    | {
        collectionId: string;
        jobId: string;
        original: string;
        originalSha256: string;
      }
    | undefined;
  try {
    fixture = JSON.parse(await readFile(pointer, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!fixture) {
    const c = syntheticFilmCollection();
    const stories = [
      "My grandmother kept a blue notebook beside her kitchen window.",
      "I learned patience while helping a friend repair an old bicycle.",
      "A quiet walk through the garden reminded me to pay attention.",
      "I hope the next generation will make time to listen.",
    ];
    const sourceText = path.join(store.dataRoot, "synthetic-script.txt");
    await writeFile(sourceText, stories.join("\n\n"), { mode: 0o600 });
    const audio = path.join(store.dataRoot, "synthetic-voice.aiff"),
      original = path.join(store.dataRoot, "media", "synthetic-original.mp4");
    await exec(
      "/usr/bin/say",
      ["-v", "Samantha", "-r", "175", "-f", sourceText, "-o", audio],
      { timeout: 120000 },
    );
    const audioProbe = await probeFilm(audio);
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0xa9b7a5:s=1280x720:r=30",
        "-i",
        audio,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-t",
        String(audioProbe.durationSeconds),
        "-shortest",
        original,
      ],
      { timeout: 120000 },
    );
    const probe = await probeFilm(original),
      durationMs = Math.floor(probe.durationSeconds * 1000),
      mediaId = `original_${randomUUID()}`,
      sessionId = randomUUID();
    c.takes = [];
    c.selectedTakeIds = {};
    c.interviews = [
      {
        id: sessionId,
        provider: "guided",
        status: "completed",
        startedAt: c.createdAt,
        endedAt: c.createdAt,
        excludedTurnIds: [],
        segments: [
          {
            id: randomUUID(),
            mediaId,
            startMs: 0,
            durationMs,
            kind: "video",
            createdAt: c.createdAt,
          },
        ],
        turns: stories.map((text, i) => ({
          id: randomUUID(),
          sequence: i,
          role: "user",
          chapterId: `q${i + 1}` as "q1" | "q2" | "q3" | "q4",
          text,
          capturedAt: c.createdAt,
          timing: "unaligned",
        })),
      },
    ];
    c.chapters.forEach((chapter, i) => {
      chapter.content = stories[i];
      chapter.sourceTakeIds = [`live-${c.interviews![0].turns[i].id}`];
      chapter.editorialReviewed = false;
      chapter.videoStatus = "awaiting_edit";
    });
    await store.putCollection(c);
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType: "video/mp4",
      originalName: "synthetic-original.mp4",
      bytes: (await stat(original)).size,
      createdAt: c.createdAt,
      localPath: original,
    });
    const queued = await jobs.enqueueAutomaticOriginalFilms(c, {
      processingApproved: true,
    });
    fixture = {
      collectionId: c.id,
      jobId: queued.id,
      original,
      originalSha256: await fileHash(original),
    };
    await writeFile(pointer, JSON.stringify(fixture), { mode: 0o600 });
  }
  const existing = await jobs.getFilmJob(fixture.jobId);
  if (existing?.status === "failed" && process.argv.includes("--retry"))
    await jobs.retryStoryFilms(
      (await store.getCollection(fixture.collectionId))!,
      fixture.jobId,
      true,
      "original",
    );
  if (!process.argv.includes("--real-asr"))
    throw new Error(
      "This synthetic end-to-end check requires explicit --real-asr, because it calls Scribe on the generated fixture audio.",
    );
  const claimed = await jobs.claimNextFilmJob(
    "synthetic-original-qa",
    Date.now(),
    fixture.jobId,
  );
  const result = claimed
    ? await processFilmJob(claimed)
    : await jobs.getFilmJob(fixture.jobId);
  if (result?.status !== "ready")
    throw new Error(
      `Synthetic fixture did not finish: ${result?.status}. ${result?.error ?? ""}`,
    );
  const c = (await store.getCollection(fixture.collectionId))!;
  if ((await fileHash(fixture.original)) !== fixture.originalSha256)
    throw new Error("Synthetic original was changed.");
  const files = await Promise.all(
    c.chapters.map(async (chapter) => {
      const media = (await store.getMedia(chapter.videoMediaId!))!;
      const probe = await probeFilm(media.localPath!);
      if (
        chapter.editorialReviewed ||
        chapter.film?.narrationKind !== "original_recording" ||
        !probe.types.includes("audio") ||
        !probe.types.includes("video")
      )
        throw new Error(
          "Synthetic output did not preserve review and media requirements.",
        );
      return {
        chapterId: chapter.id,
        file: media.localPath,
        durationSeconds: probe.durationSeconds,
        outputSha256: chapter.film.outputSha256,
      };
    }),
  );
  const report = {
    collectionId: c.id,
    jobId: result.id,
    originalPreserved: true,
    films: files,
    reviewUrl: `/collection/${c.id}/review?key=${c.ownerKey}`,
  };
  await writeFile(
    path.join(store.dataRoot, "verified.json"),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "ready",
      films: files.map(({ chapterId, durationSeconds }) => ({
        chapterId,
        durationSeconds,
      })),
      report: path.join(store.dataRoot, "verified.json"),
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Synthetic film verification failed.",
  );
  process.exitCode = 1;
});
