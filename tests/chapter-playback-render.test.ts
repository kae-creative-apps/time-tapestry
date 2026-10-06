import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cleanTranscript } from "../src/lib/audio/transcript-cleaner";
import type { SourceWord } from "../src/lib/collection/films/word-matching";
import type { ChapterVideoPlan } from "../src/lib/video-plan";
const exec = promisify(execFile);

test("chapter AAC contains only selected intervals, retimes captions and safely retries an interrupted render", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "chapter-audio-render-"),
  );
  for (const key of [
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "VERCEL",
  ])
    delete process.env[key];
  process.env.COLLECTION_DATA_DIR = directory;
  const { syntheticRecordedFilmCollection } = await import("./film-fixture");
  const { enqueueAutomaticOriginalFilms } =
    await import("../src/lib/collection/films/jobstore");
  const { prepareChapterPlayback } =
    await import("../src/lib/collection/films/playback-render");
  const { fileHash, probeFilm } =
    await import("../src/lib/collection/films/render");
  const { getMedia } = await import("../src/lib/collection/store");
  try {
    const c = await syntheticRecordedFilmCollection("voice");
    const job = await enqueueAutomaticOriginalFilms(c, {
      processingApproved: true,
      outputMode: "interactive",
    });
    const chapter = job.chapters[0];
    const source = path.join(directory, "original.wav");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=3",
      "-c:a",
      "pcm_s16le",
      source,
    ]);
    const originalHash = await fileHash(source);
    const plan: ChapterVideoPlan = {
      schemaVersion: 1,
      id: "render-fixture",
      sessionId: c.id,
      chapterId: "q1",
      chapterNumber: 1,
      revision: 1,
      title: "Synthetic chapter",
      storytellerName: "Alex Example",
      approval: null,
      sources: [
        {
          assetId: "audio",
          sourceAnswerId: "answer",
          takeId: "take",
          acceptedTakeId: "take",
          kind: "audio",
          relativePath: "original.wav",
          sha256: originalHash,
          durationMs: 3000,
          archiveRef: "original",
          originalPreserved: true,
        },
      ],
      clips: [0, 2000].map((start, index) => ({
        id: `clip-${index}`,
        sourceAnswerId: "answer",
        sourceAssetId: "audio",
        kind: "audio",
        inMs: start,
        outMs: start + 1000,
        audioFadeInMs: 15,
        audioFadeOutMs: 15,
        captions: [
          {
            text: index ? "again" : "Hello",
            startMs: start + 100,
            endMs: start + 900,
            timestampMs: null,
            confidence: null,
          },
        ],
        editorialReason: "Synthetic preserved passage",
      })),
    };
    const work = path.join(directory, "work");
    await mkdir(work);
    const prepared = {
      plan,
      assets: new Map([["audio", { file: source, mime: "audio/wav" }]]),
      sourceAssets: [],
    };
    const p = await prepareChapterPlayback(
      job,
      chapter,
      prepared,
      work,
      async () => {},
    );
    assert.equal(p.durationMs, 2000);
    assert.deepEqual(
      p.words.map((w) => [w.text, w.startMs, w.endMs]),
      [
        ["Hello", 100, 900],
        ["again", 1100, 1900],
      ],
    );
    const media = await getMedia(p.mediaId);
    assert.equal(media?.provenance, "chapter_playback");
    assert.equal(media?.mimeType, "audio/mp4");
    const probe = await probeFilm(media!.localPath!);
    assert.deepEqual(probe.types, ["audio"]);
    assert.ok(Math.abs(probe.durationSeconds - 2) < 0.1);
    const { stdout } = await exec("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=sample_rate,channels",
      "-of",
      "json",
      media!.localPath!,
    ]);
    assert.equal(JSON.parse(stdout).streams[0].sample_rate, "24000");
    assert.equal(JSON.parse(stdout).streams[0].channels, 1);
    assert.equal(await fileHash(source), originalHash);
    const output = path.join(work, `playback-${p.planSha256}.m4a`);
    await writeFile(output, "interrupted partial file");
    const retried = await prepareChapterPlayback(
      job,
      chapter,
      prepared,
      work,
      async () => {},
    );
    assert.equal(retried.mediaId, p.mediaId);
    assert.ok((await readFile(output)).length > 100);
    // A playable file of the correct duration is not proof it is this chapter.
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=24000:duration=2",
      "-c:a",
      "aac",
      "-y",
      output,
    ]);
    assert.notEqual(await fileHash(output), p.outputSha256);
    const repaired = await prepareChapterPlayback(
      job,
      chapter,
      prepared,
      work,
      async () => {},
    );
    assert.equal(repaired.outputSha256, p.outputSha256);
    await assert.rejects(
      prepareChapterPlayback(job, chapter, prepared, work, async () => {
        throw new Error("stale job");
      }),
      /stale job/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cleanup preserves uncertain timing and meaningful repetition while flagging possible stutters", () => {
  const words: SourceWord[] = [
    {
      mediaId: "source",
      text: "very",
      startMs: 100,
      endMs: 300,
      languageCode: "en",
    },
    {
      mediaId: "source",
      text: "very",
      startMs: 350,
      endMs: 550,
      languageCode: "en",
    },
    {
      mediaId: "source",
      text: "kind",
      startMs: 600,
      endMs: 900,
      languageCode: "en",
    },
  ];
  const result = cleanTranscript({
    mediaId: "source",
    durationMs: 1000,
    words,
  });
  assert.equal(result.removed.length, 0);
  assert.equal(result.flags[0].reason, "possible_stutter");
  const invalid = cleanTranscript({
    mediaId: "source",
    durationMs: 1000,
    words: [{ ...words[0], endMs: 0 }],
  });
  assert.equal(invalid.fallback, true);
  assert.deepEqual(invalid.clips, [
    { mediaId: "source", inMs: 0, outMs: 1000 },
  ]);
});
