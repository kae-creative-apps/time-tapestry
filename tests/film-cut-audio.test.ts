import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  readFile,
  writeFile,
  stat,
  rm,
  readdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  clipTiming,
  clipFrames,
  clipSourceTimeMs,
  clipAudioSamples,
  chapterDurationFrames,
  validateVideoPlan,
  type VideoClip,
  type ChapterVideoPlan,
} from "../src/lib/video-plan";
import {
  prepareCutAudio,
  cutAudioEnvelope,
} from "../src/lib/collection/films/cut-audio";
import { fileHash } from "../src/lib/collection/films/render";
const exec = promisify(execFile);
const clip = (inMs: number, outMs: number): VideoClip => ({
  id: "clip",
  sourceAnswerId: "answer",
  sourceAssetId: "source",
  kind: "video",
  inMs,
  outMs,
  captions: [
    {
      text: "A retained word",
      startMs: inMs + 40,
      endMs: outMs - 40,
      timestampMs: null,
      confidence: null,
    },
  ],
  audioFadeInMs: 15,
  audioFadeOutMs: 15,
  editorialReason: "Synthetic safe handles",
});
async function pcmFixture(directory: string, seconds = 4) {
  const file = path.join(directory, "source.wav");
  // Actual stereo PCM, with different channels. A continuous waveform means a
  // dropped, duplicated or shifted sample is observable in the retained interior.
  await exec("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=0.2*sin(2*PI*437*t)+0.04|0.3*sin(2*PI*659*t)-0.03:s=48000:d=${seconds}`,
    "-c:a",
    "pcm_s16le",
    file,
  ]);
  const { stdout } = await exec(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "s16le", "-c:a", "pcm_s16le", "pipe:1"],
    { encoding: "buffer", maxBuffer: 8_000_000 },
  );
  return { file, samples: stdout, hash: await fileHash(file) };
}

test("frame-aligned source cuts never gain a frame from floating-point noise", () => {
  for (let start = 0; start < 10000; start++) {
    for (const length of [1, 3, 17, 91]) {
      const item = clip((start * 1000) / 30, ((start + length) * 1000) / 30);
      assert.equal(clipFrames(item), length);
      assert.equal(clipTiming(item).startFrame, start);
      assert.equal(clipTiming(item).endFrame, start + length);
    }
  }
});

test("many non-frame audio/video cuts use one exact playback and caption clock", () => {
  const clips = Array.from({ length: 120 }, (_, i) => ({
    ...clip(i * 1000 + 51, i * 1000 + 698),
    id: `clip-${i}`,
    kind: i % 2 ? ("audio" as const) : ("video" as const),
  }));
  let elapsed = 90;
  for (const item of clips) {
    const timing = clipTiming(item);
    assert.equal(timing.durationFrames, timing.endFrame - timing.startFrame);
    assert.equal(
      clipAudioSamples(item).sampleCount,
      timing.durationFrames * 1600,
    );
    for (let frame = 0; frame < timing.durationFrames; frame++) {
      assert.equal(
        clipSourceTimeMs(item, frame),
        ((timing.startFrame + frame) * 1000) / 30,
      );
      assert.equal((elapsed + frame) * 1600, elapsed * 1600 + frame * 1600);
    }
    elapsed += timing.durationFrames;
  }
  assert.equal(
    chapterDurationFrames({ clips } as ChapterVideoPlan),
    elapsed + 120,
  );
  const tinyHandle = clip(1000, 2000);
  tinyHandle.captions[0].startMs = 1010;
  tinyHandle.captions[0].endMs = 1990;
  assert.equal(clipAudioSamples(tinyHandle).fadeInSamples, 480);
  assert.equal(clipAudioSamples(tinyHandle).fadeOutSamples, 480);
});

test("real stereo PCM cuts preserve every interior sample, de-click boundaries and reuse checked output", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "cut-audio-"));
  try {
    const source = await pcmFixture(work);
    const item = clip(501, 1498),
      timing = clipTiming(item);
    const result = await prepareCutAudio(
      source.file,
      source.hash,
      item,
      path.join(work, "cuts"),
    );
    const bytes = await readFile(result.file),
      data = bytes.subarray(44);
    assert.equal(result.metadata.sampleCount, 48000);
    assert.equal(data.length, result.metadata.sampleCount * 4);
    assert.equal(result.metadata.fadeInSamples, 720);
    assert.equal(result.metadata.fadeOutSamples, 720);
    const original = source.samples.subarray(
      timing.startFrame * 1600 * 4,
      timing.endFrame * 1600 * 4,
    );
    assert.deepEqual(
      data.subarray(720 * 4, (48000 - 721) * 4),
      original.subarray(720 * 4, (48000 - 721) * 4),
    );
    for (const channel of [0, 1]) {
      assert.equal(data.readInt16LE(channel * 2), 0);
      assert.equal(data.readInt16LE(data.length - 4 + channel * 2), 0);
      const at = 360 * 4 + channel * 2;
      assert.equal(
        data.readInt16LE(at),
        Math.round(original.readInt16LE(at) * 0.5),
      );
    }
    const probe = await exec("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=duration_ts,sample_rate,channels",
      "-of",
      "json",
      result.file,
    ]);
    assert.deepEqual(JSON.parse(probe.stdout).streams[0], {
      sample_rate: "48000",
      channels: 2,
      duration_ts: 48000,
    });
    const envelope = await cutAudioEnvelope(
      result.file,
      result.metadata.sampleCount,
    );
    assert.equal(envelope.sampleRate, 30);
    assert.equal(envelope.levels.length, 30);
    assert.ok(
      envelope.levels.every(
        (level) => Number.isFinite(level) && level >= 0 && level <= 1,
      ),
    );
    assert.ok(envelope.levels[0] < Math.max(...envelope.levels.slice(1, -1)));
    await assert.rejects(
      cutAudioEnvelope(result.file, result.metadata.sampleCount + 1600),
      /frame budget/,
    );
    const unchangedAt = (await stat(result.file)).mtimeMs;
    assert.deepEqual(
      await prepareCutAudio(
        source.file,
        source.hash,
        item,
        path.join(work, "cuts"),
      ),
      result,
    );
    assert.equal((await stat(result.file)).mtimeMs, unchangedAt);
    const changed = Buffer.from(bytes);
    changed[1000] ^= 127;
    await writeFile(result.file, changed);
    const repaired = await prepareCutAudio(
      source.file,
      source.hash,
      item,
      path.join(work, "cuts"),
    );
    assert.equal(repaired.metadata.sha256, result.metadata.sha256);
    assert.equal(await fileHash(source.file), source.hash);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("outward endpoint rounding only pads the final fractional frame and stale work stops", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "cut-audio-tail-"));
  try {
    const source = await pcmFixture(work, 1.987);
    const item = clip(1701, 1987),
      cutWork = path.join(work, "cuts");
    const result = await prepareCutAudio(
      source.file,
      source.hash,
      item,
      cutWork,
    );
    const data = (await readFile(result.file)).subarray(44);
    assert.equal(data.length, clipFrames(item) * 1600 * 4);
    assert.ok(
      data.subarray(data.length - 624 * 4).every((value) => value === 0),
    );
    await assert.rejects(
      prepareCutAudio(source.file, source.hash, clip(1800, 2200), cutWork),
      /does not cover/,
    );
    let checks = 0;
    await assert.rejects(
      prepareCutAudio(
        source.file,
        source.hash,
        clip(100, 700),
        cutWork,
        async () => {
          if (++checks === 2) throw new Error("stale synthetic job");
        },
      ),
      /stale synthetic job/,
    );
    assert.equal(
      (await readdir(cutWork)).filter((name) => name.endsWith(".tmp")).length,
      0,
    );
    assert.equal(await fileHash(source.file), source.hash);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("plan validation rejects changed frame/sample binding and unsafe declared fades", () => {
  const item = clip(501, 1498);
  const plan: ChapterVideoPlan = {
    schemaVersion: 1,
    id: "synthetic",
    sessionId: "synthetic",
    chapterId: "q1",
    chapterNumber: 1,
    revision: 1,
    title: "Synthetic",
    storytellerName: "Fixture",
    approval: null,
    clips: [item],
    sources: [
      {
        assetId: "source",
        sourceAnswerId: "answer",
        takeId: "take",
        acceptedTakeId: "take",
        kind: "video",
        relativePath: "source.mp4",
        sha256: "a".repeat(64),
        durationMs: 4000,
        archiveRef: "synthetic",
        originalPreserved: true,
      },
    ],
  };
  item.audioDerivative = {
    assetId: "cut",
    relativePath: "cut.wav",
    sha256: "b".repeat(64),
    sampleRate: 48000,
    sampleCount: 48000,
    startFrame: 15,
    endFrame: 45,
    fadeInSamples: 720,
    fadeOutSamples: 720,
  };
  validateVideoPlan(plan, { requireApproval: false });
  item.audioDerivative.sampleCount += 1600;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /exact source interval/,
  );
  item.audioDerivative.sampleCount -= 1600;
  item.audioFadeInMs = 16;
  assert.throws(
    () => validateVideoPlan(plan, { requireApproval: false }),
    /at most 15ms/,
  );
});

test("many real PCM cuts preserve a cumulative frame budget without repeated decoding", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "cut-audio-many-"));
  try {
    const source = await pcmFixture(work);
    const clips: VideoClip[] = [];
    let sampleCount = 0;
    for (let index = 0; index < 30; index++) {
      const item = {
        ...clip(index * 100 + 1, index * 100 + 98),
        id: `cut-${index}`,
        kind: index % 2 ? ("audio" as const) : ("video" as const),
      };
      const result = await prepareCutAudio(
        source.file,
        source.hash,
        item,
        path.join(work, "cuts"),
      );
      item.audioDerivative = result.metadata;
      const bytes = await readFile(result.file);
      assert.equal(bytes.length - 44, result.metadata.sampleCount * 4);
      const middleSample = 1600;
      const sourceSample = clipTiming(item).startFrame * 1600 + middleSample;
      assert.equal(
        bytes.readInt16LE(44 + middleSample * 4),
        source.samples.readInt16LE(sourceSample * 4),
      );
      sampleCount += result.metadata.sampleCount;
      clips.push(item);
    }
    assert.equal(
      sampleCount,
      clips.reduce((sum, item) => sum + clipFrames(item), 0) * 1600,
    );
    assert.equal(await fileHash(source.file), source.hash);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
