/** Provider-free smoke test. Run in the worker image with Docker --network none. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  chapterDurationFrames,
  VIDEO_FPS,
  type ChapterVideoPlan,
} from "../src/lib/video-plan";
import type { Collection } from "../src/lib/collection/types";

const exec = promisify(execFile);

async function main() {
  const scratch = await mkdtemp(path.join(tmpdir(), "worker-container-smoke-"));
  // Set these before importing the renderer so browser profiles, bundles and
  // media derivatives stay under this test's own temporary directory.
  process.env.TMPDIR = scratch;
  process.env.TMP = scratch;
  process.env.TEMP = scratch;
  process.env.COLLECTION_DATA_DIR = path.join(scratch, "collections");
  try {
    const [
      { ensureBrowser, openBrowser },
      { renderOriginalFilm },
      { prepareCutAudio },
      render,
      { enqueueStoryFilms },
      { RECORDING_ONLY_FILMS_MESSAGE },
    ] = await Promise.all([
      import("@remotion/renderer"),
      import("../src/lib/collection/films/original-render"),
      import("../src/lib/collection/films/cut-audio"),
      import("../src/lib/collection/films/render"),
      import("../src/lib/collection/films/jobstore"),
      import("../src/lib/collection/films/policy"),
    ]);
    const { fileHash, probeFilm } = render;
    for (const binary of ["ffmpeg", "ffprobe"]) {
      await exec(binary, ["-version"], { timeout: 10000 });
    }
    console.log("PASS: ffmpeg and ffprobe execute.");

    const installed = await ensureBrowser({
      logLevel: "error",
      onBrowserDownload: () => {
        throw new Error(
          "Chrome is missing from the image. Install it during docker build; this test never downloads a browser.",
        );
      },
    });
    assert(
      installed.type === "local-puppeteer-browser" ||
        installed.type === "user-defined-path",
      "A preinstalled Remotion browser is required.",
    );
    const browser = await openBrowser("chrome", {
      browserExecutable: installed.path,
      logLevel: "error",
    });
    await browser.close({ silent: true });
    console.log("PASS: the image's Remotion browser launches and closes.");

    const font = path.resolve("public/brand/fonts/quicksand-latin.woff2");
    const fontBytes = await readFile(font);
    assert.equal(fontBytes.subarray(0, 4).toString("ascii"), "wOF2");
    const questionFont = path.resolve(
      "public/brand/fonts/inter-latin-400.woff2",
    );
    const questionFontBytes = await readFile(questionFont);
    assert.equal(questionFontBytes.subarray(0, 4).toString("ascii"), "wOF2");
    const questionMusic = path.resolve(
      "public/brand/audio/question-card-bed.wav",
    );
    const questionMusicStat = await stat(questionMusic);
    assert(questionMusicStat.size > 44, "question-card music is empty");
    const closer = path.resolve("public/brand/film-closer-v2.mp4");
    const closerProbe = await probeFilm(closer);
    assert(closerProbe.types.includes("video"));
    assert(Math.abs(closerProbe.durationSeconds - 4) <= 0.05);
    const closerHash = await fileHash(closer);
    console.log("PASS: the committed brand font and four-second closer exist.");

    const source = path.join(scratch, "synthetic-source.mp4");
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x675040:s=640x360:r=30:d=1",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=1",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        source,
      ],
      { timeout: 30000 },
    );
    const sourceHash = await fileHash(source);
    const tone = path.join(scratch, "synthetic-tone.wav");
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-t",
        "1",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        tone,
      ],
      { timeout: 30000 },
    );
    const toneHash = await fileHash(tone);
    const preservedFiles = new Map([
      [source, sourceHash],
      [tone, toneHash],
      [closer, closerHash],
      [font, await fileHash(font)],
    ]);
    const plan: ChapterVideoPlan = {
      schemaVersion: 1,
      id: "container-smoke",
      sessionId: "synthetic-container-smoke",
      chapterId: "synthetic-chapter",
      chapterNumber: 1,
      revision: 1,
      title: "Worker container verification",
      storytellerName: "Synthetic fixture",
      sources: [
        {
          assetId: "synthetic-source",
          sourceAnswerId: "synthetic-answer",
          takeId: "synthetic-take",
          acceptedTakeId: "synthetic-take",
          kind: "video",
          relativePath: "synthetic-source.mp4",
          sha256: sourceHash,
          durationMs: 1000,
          archiveRef: "synthetic-fixture-only",
          originalPreserved: true,
          audioDerivative: {
            relativePath: "synthetic-tone.wav",
            sha256: toneHash,
            method: "ffmpeg-cleanup",
            durationMs: 1000,
          },
        },
      ],
      clips: [
        {
          id: "synthetic-clip",
          sourceAnswerId: "synthetic-answer",
          sourceAssetId: "synthetic-source",
          kind: "video",
          inMs: 101,
          outMs: 898,
          audioFadeInMs: 15,
          audioFadeOutMs: 15,
          captions: [
            {
              text: "Synthetic audio and video. No family story data.",
              startMs: 200,
              endMs: 800,
              timestampMs: null,
              confidence: null,
            },
          ],
          editorialReason:
            "Exercise the production composition with a fixture.",
        },
      ],
      approval: {
        approvedBy: "Automated synthetic fixture",
        approvedAt: "2026-10-05T00:00:00.000Z",
      },
      brandCloser: {
        relativePath: "brand-closer.mp4",
        sha256: closerHash,
        durationMs: 4000,
      },
    };
    const cut = await prepareCutAudio(
      tone,
      toneHash,
      plan.clips[0],
      path.join(scratch, "cuts"),
    );
    plan.clips[0].audioDerivative = cut.metadata;
    assert.equal(cut.metadata.startFrame, 3);
    assert.equal(cut.metadata.endFrame, 27);
    assert.equal(cut.metadata.sampleCount, 38400);
    const cutBytes = await readFile(cut.file);
    assert.equal(cutBytes.readInt16LE(44), 0);
    assert.equal(cutBytes.readInt16LE(cutBytes.length - 2), 0);
    preservedFiles.set(cut.file, cut.metadata.sha256);
    const expectedDuration = chapterDurationFrames(plan) / VIDEO_FPS;
    const output = path.join(scratch, "synthetic-chapter.mp4");
    console.log("Rendering the real ChapterFilm composition at concurrency 2.");
    const result = await renderOriginalFilm(
      {
        plan,
        assets: new Map([
          ["synthetic-source", { file: source, mime: "video/mp4" }],
          ["synthetic-source:audio", { file: tone, mime: "audio/wav" }],
          [cut.metadata.assetId, { file: cut.file, mime: "audio/wav" }],
          ["brand-closer", { file: closer, mime: "video/mp4" }],
          ["brand-font", { file: font, mime: "font/woff2" }],
        ]),
        sourceAssets: [
          {
            mediaId: "synthetic-source",
            sha256: sourceHash,
            durationMs: 1000,
          },
        ],
      },
      output,
      async () => {},
      async () => {},
    );
    async function verifyOutput(
      outputFile: string,
      receipt: {
        outputSha256: string;
        durationSeconds: number;
        releaseEligible: boolean;
        sourceAssets: { mediaId: string; sha256: string; durationMs: number }[];
      },
      label: string,
      expectedSourceHash: string,
    ) {
      const { stdout } = await exec(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=codec_type,codec_name,width,height",
          "-of",
          "json",
          outputFile,
        ],
        { timeout: 10000 },
      );
      const metadata = JSON.parse(stdout) as {
        format: { duration: string };
        streams: {
          codec_type: string;
          codec_name: string;
          width?: number;
          height?: number;
        }[];
      };
      const video = metadata.streams.find(
        (item) => item.codec_type === "video",
      );
      const audio = metadata.streams.find(
        (item) => item.codec_type === "audio",
      );
      assert.equal(video?.codec_name, "h264");
      assert.equal(video.width, 1920);
      assert.equal(video.height, 1080);
      assert.equal(audio?.codec_name, "aac");
      const decoded = await exec(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          outputFile,
          "-ss",
          "3",
          "-t",
          "0.8",
          "-map",
          "0:a:0",
          "-ac",
          "1",
          "-ar",
          "48000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 200000 },
      );
      assert.equal(decoded.stdout.length, cut.metadata.sampleCount * 2);
      let energy = 0;
      for (
        let sample = 2400;
        sample < cut.metadata.sampleCount - 2400;
        sample++
      )
        energy += decoded.stdout.readInt16LE(sample * 2) ** 2;
      assert(
        energy / (cut.metadata.sampleCount - 4800) > 10000,
        "The retained original audio must remain audible.",
      );
      assert(
        Math.abs(Number(metadata.format.duration) - expectedDuration) <= 0.2,
      );
      assert((await stat(outputFile)).size > 0);
      for (const [file, hash] of preservedFiles)
        assert.equal(
          await fileHash(file),
          hash,
          `${label} changed a preserved fixture or brand asset.`,
        );
      assert.equal(receipt.outputSha256, await fileHash(outputFile));
      assert(Math.abs(receipt.durationSeconds - expectedDuration) <= 0.2);
      assert.equal(receipt.releaseEligible, false);
      assert.deepEqual(receipt.sourceAssets, [
        {
          mediaId: "synthetic-source",
          sha256: expectedSourceHash,
          durationMs: 1000,
        },
      ]);
      const savedReceipt = JSON.parse(
        await readFile(`${outputFile}.result.json`, "utf8"),
      );
      assert.equal(savedReceipt.outputSha256, receipt.outputSha256);
      assert.equal(savedReceipt.status, "rendered-awaiting-review");
      assert.equal(savedReceipt.releaseEligible, false);
      assert.deepEqual(savedReceipt.sourceAssets, receipt.sourceAssets);
      console.log(
        `PASS: ${label}: 1920x1080 H.264/AAC, ${expectedDuration} seconds with frame-aligned source cuts and sample-smoothed audio, preserved fixture and brand hashes, matching output receipt, and review still required.`,
      );
    }
    await verifyOutput(output, result, "original video", sourceHash);

    const originalAudioPlan: ChapterVideoPlan = {
      ...plan,
      id: "container-smoke-original-audio",
      chapterNumber: 2,
      sources: plan.sources.map(
        ({ audioDerivative: _workingAudio, ...item }) => ({
          ...item,
          kind: "audio",
          relativePath: "synthetic-tone.wav",
          sha256: toneHash,
        }),
      ),
      clips: plan.clips.map((clip) => ({ ...clip, kind: "audio" })),
    };
    const audioOutput = path.join(scratch, "synthetic-original-audio.mp4");
    console.log(
      "Rendering the original audio-only orb with the synthetic tone.",
    );
    const audioResult = await renderOriginalFilm(
      {
        plan: originalAudioPlan,
        assets: new Map([
          ["synthetic-source", { file: tone, mime: "audio/wav" }],
          [cut.metadata.assetId, { file: cut.file, mime: "audio/wav" }],
          ["brand-closer", { file: closer, mime: "video/mp4" }],
          ["brand-font", { file: font, mime: "font/woff2" }],
        ]),
        sourceAssets: [
          { mediaId: "synthetic-source", sha256: toneHash, durationMs: 1000 },
        ],
      },
      audioOutput,
      async () => {},
      async () => {},
    );
    await verifyOutput(
      audioOutput,
      audioResult,
      "original audio-only orb",
      toneHash,
    );

    let voiceResolverCalled = false;
    await assert.rejects(
      enqueueStoryFilms({} as Collection, true, {
        resolveVoice: async () => {
          voiceResolverCalled = true;
          throw new Error("A retired AI queue must never resolve a voice.");
        },
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === RECORDING_ONLY_FILMS_MESSAGE,
    );
    assert.equal(voiceResolverCalled, false);
    console.log(
      "PASS: retired AI narration cannot enter the worker queue or resolve a voice.",
    );
    console.log(
      "PASS: no collection records, credentials, or providers were used.",
    );
  } finally {
    // Only remove the directory created by this invocation, never /data.
    await rm(scratch, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(
    "Worker container smoke test failed:",
    error instanceof Error ? error.message : "Unknown verification failure.",
  );
  process.exitCode = 1;
});
