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
const multiSegment = process.argv.includes("--multi-segment");
process.env.COLLECTION_DATA_DIR = path.resolve(
  multiSegment
    ? ".data/original-multisegment-qa"
    : ".data/original-automatic-qa",
);
for (const key of [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "VERCEL",
  "BLOB_READ_WRITE_TOKEN",
])
  delete process.env[key];
type Fixture = {
  collectionId: string;
  jobId: string;
  original: string;
  originalSha256: string;
  originals?: { file: string; sha256: string }[];
  transcripts?: Record<
    string,
    import("../src/lib/collection/films/word-matching").SourceWord[]
  >;
};
async function multiSegmentFixture(
  store: typeof import("../src/lib/collection/store"),
  jobs: typeof import("../src/lib/collection/films/jobstore"),
  probeFilm: typeof import("../src/lib/collection/films/render").probeFilm,
  fileHash: typeof import("../src/lib/collection/films/render").fileHash,
): Promise<Fixture> {
  const { matchSourceWords } =
    await import("../src/lib/collection/films/word-matching");
  const { sourceTranscriptKey } =
    await import("../src/lib/collection/films/transcript-cache");
  const oldRoot = path.resolve(".data/original-automatic-qa");
  const previous = JSON.parse(
    await readFile(path.join(oldRoot, "fixture.json"), "utf8"),
  );
  const originalCollection = JSON.parse(
    await readFile(path.join(oldRoot, `${previous.collectionId}.json`), "utf8"),
  );
  if (
    !originalCollection.id.startsWith("synthetic_") ||
    !originalCollection.storyteller.email.endsWith("@example.test")
  )
    throw new Error(
      "This check only accepts the existing fictional QA fixture.",
    );
  if ((await fileHash(previous.original)) !== previous.originalSha256)
    throw new Error("The synthetic source changed.");
  const oldCache = path.join(
    oldRoot,
    "film-work",
    previous.jobId,
    "transcripts",
    `${sourceTranscriptKey(previous.originalSha256)}.json`,
  );
  const saved = JSON.parse(await readFile(oldCache, "utf8"));
  const words =
    saved.words as import("../src/lib/collection/films/word-matching").SourceWord[];
  const originalTurns = originalCollection.interviews[0].turns;
  const second = matchSourceWords(originalTurns[1].text, words).words;
  const third = matchSourceWords(originalTurns[2].text, words).words;
  const fourth = matchSourceWords(originalTurns[3].text, words).words;
  const total = Math.floor(
    (await probeFilm(previous.original)).durationSeconds * 1000,
  );
  const definitions = [
    {
      from: 0,
      to: second[6].endMs + 40,
      kind: "video" as const,
      extension: "webm",
    },
    {
      from: second[4].startMs - 40,
      to: third.at(-1)!.endMs + 80,
      kind: "video" as const,
      extension: "mp4",
    },
    {
      from: fourth[0].startMs - 80,
      to: total,
      kind: "voice" as const,
      extension: "wav",
    },
  ];
  const c = syntheticFilmCollection();
  c.takes = [];
  c.selectedTakeIds = {};
  const transcripts: NonNullable<Fixture["transcripts"]> = {},
    originals: NonNullable<Fixture["originals"]> = [],
    segments: import("../src/lib/collection/types").InterviewSegment[] = [];
  for (const [index, definition] of definitions.entries()) {
    const mediaId = `original_${randomUUID()}`,
      file = path.join(
        store.dataRoot,
        "media",
        `synthetic-segment-${index + 1}.${definition.extension}`,
      );
    const base = [
      "-nostdin",
      "-y",
      "-v",
      "error",
      "-ss",
      String(definition.from / 1000),
      "-i",
      previous.original,
      "-t",
      String((definition.to - definition.from) / 1000),
    ];
    if (definition.extension === "webm") {
      const { stdout } = await exec(
        "ffmpeg",
        [
          ...base,
          "-c:v",
          "libvpx-vp9",
          "-deadline",
          "realtime",
          "-cpu-used",
          "8",
          "-c:a",
          "libopus",
          "-f",
          "webm",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 120000 },
      );
      await writeFile(file, stdout);
    } else
      await exec(
        "ffmpeg",
        [
          ...base,
          ...(definition.kind === "voice"
            ? ["-vn", "-c:a", "pcm_s16le", "-ar", "48000"]
            : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]),
          file,
        ],
        { timeout: 120000 },
      );
    const durationMs = definition.to - definition.from;
    transcripts[mediaId] = words
      .filter(
        (word) =>
          word.startMs >= definition.from && word.endMs <= definition.to,
      )
      .map((word) => ({
        ...word,
        mediaId,
        startMs: word.startMs - definition.from,
        endMs: word.endMs - definition.from,
      }));
    originals.push({ file, sha256: await fileHash(file) });
    segments.push({
      id: randomUUID(),
      mediaId,
      kind: definition.kind,
      startMs: definition.from + (index === 2 ? 120000 : 0),
      durationMs,
      createdAt: c.createdAt,
    });
    await store.putMedia({
      id: mediaId,
      collectionId: c.id,
      role: "owner",
      mimeType:
        definition.extension === "webm"
          ? "video/webm"
          : definition.kind === "voice"
            ? "audio/wav"
            : "video/mp4",
      originalName: path.basename(file),
      bytes: (await stat(file)).size,
      createdAt: c.createdAt,
      localPath: file,
    });
  }
  const firstWords = matchSourceWords(originalTurns[0].text, words).words;
  const texts = [
    firstWords
      .slice(0, 6)
      .map((word) => word.text)
      .join(" "),
    firstWords
      .slice(6)
      .map((word) => word.text)
      .join(" "),
    ...originalTurns.slice(1).map((turn: { text: string }) => turn.text),
  ];
  const turns = texts.map((text, index) => ({
    id: randomUUID(),
    sequence: index,
    role: "user" as const,
    chapterId: `q${Math.max(1, index)}` as "q1" | "q2" | "q3" | "q4",
    text,
    capturedAt: c.createdAt,
    timing: "unaligned" as const,
  }));
  c.interviews = [
    {
      id: randomUUID(),
      provider: "guided",
      status: "completed",
      startedAt: c.createdAt,
      endedAt: c.createdAt,
      excludedTurnIds: [],
      segments,
      turns,
    },
  ];
  c.chapters.forEach((chapter) => {
    chapter.content = turns
      .filter((turn) => turn.chapterId === chapter.id)
      .map((turn) => turn.text)
      .join(" ");
    chapter.sourceTakeIds = turns
      .filter((turn) => turn.chapterId === chapter.id)
      .map((turn) => `live-${turn.id}`);
    chapter.editorialReviewed = false;
    chapter.videoStatus = "awaiting_edit";
  });
  await store.putCollection(c);
  const job = await jobs.enqueueAutomaticOriginalFilms(c, {
    processingApproved: true,
  });
  return {
    collectionId: c.id,
    jobId: job.id,
    original: previous.original,
    originalSha256: previous.originalSha256,
    originals,
    transcripts,
  };
}

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
  let fixture: Fixture | undefined;
  try {
    fixture = JSON.parse(await readFile(pointer, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!fixture && multiSegment) {
    fixture = await multiSegmentFixture(store, jobs, probeFilm, fileHash);
    await writeFile(pointer, JSON.stringify(fixture), { mode: 0o600 });
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
  if (!multiSegment && !process.argv.includes("--real-asr"))
    throw new Error(
      "This synthetic end-to-end check requires explicit --real-asr, because it calls Scribe on the generated fixture audio.",
    );
  const claimed = await jobs.claimNextFilmJob(
    "synthetic-original-qa",
    Date.now(),
    fixture.jobId,
  );
  const result = claimed
    ? await processFilmJob(
        claimed,
        multiSegment
          ? {
              transcribe: async (_file, mediaId) => {
                const words = fixture!.transcripts?.[mediaId];
                if (!words)
                  throw new Error(
                    "The synthetic fixture is missing its cached source words.",
                  );
                return words;
              },
            }
          : {},
      )
    : await jobs.getFilmJob(fixture.jobId);
  if (result?.status !== "ready")
    throw new Error(
      `Synthetic fixture did not finish: ${result?.status}. ${result?.error ?? ""}`,
    );
  const c = (await store.getCollection(fixture.collectionId))!;
  if ((await fileHash(fixture.original)) !== fixture.originalSha256)
    throw new Error("Synthetic original was changed.");
  for (const original of fixture.originals ?? [])
    if ((await fileHash(original.file)) !== original.sha256)
      throw new Error("A synthetic segment was changed.");
  if (multiSegment) {
    const edits = result.chapters.map((chapter) => chapter.sourceEdit!);
    if (edits[0].clips.length !== 2 || edits[1].clips.length !== 2)
      throw new Error(
        "Multi-turn or rollover source boundaries were not retained.",
      );
    const allMedia = c.interviews![0].segments;
    if (
      !edits[3].clips.every(
        (clip) =>
          allMedia.find((source) => source.mediaId === clip.mediaId)?.kind ===
          "voice",
      )
    )
      throw new Error(
        "The audio-only story did not use its original voice source.",
      );
  }
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
    fixtureMode: multiSegment
      ? "multi-segment-cached-source-words"
      : "real-scribe",
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
