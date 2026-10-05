import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { before, after, test } from "node:test";
import {
  audioEnvelopeLevel,
  type AudioEnvelope,
} from "../src/lib/film-audio-envelope";
import { extractAudioEnvelope } from "../src/lib/collection/films/audio-envelope";

const exec = promisify(execFile);
let directory: string;
let ffmpegAvailable = false;

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "audio-envelope-tests-"));
  ffmpegAvailable = await exec("ffmpeg", ["-version"], { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function wav(
  name: string,
  durationSeconds: number,
  amplitude: (time: number) => number,
) {
  const sampleRate = 44100;
  const samples = Math.round(durationSeconds * sampleRate);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++)
    bytes.writeInt16LE(
      Math.round(
        Math.max(-1, Math.min(1, amplitude(index / sampleRate))) * 32767,
      ),
      44 + index * 2,
    );
  const file = path.join(directory, name);
  await writeFile(file, bytes);
  return { file, bytes };
}

test("envelope lookup is bounded and never extends missing or completed audio", () => {
  const envelope: AudioEnvelope = { sampleRate: 10, levels: [0, 0.5, 1] };
  assert.equal(audioEnvelopeLevel(envelope, 0), 0);
  assert.equal(audioEnvelopeLevel(envelope, 150), 0.5);
  assert.equal(audioEnvelopeLevel(envelope, 299), 1);
  for (const time of [-1, 300, 3000, NaN, Infinity])
    assert.equal(audioEnvelopeLevel(envelope, time), 0);
  assert.equal(audioEnvelopeLevel(undefined, 100), 0);
  assert.equal(audioEnvelopeLevel({ sampleRate: 0, levels: [1] }, 0), 0);
  const invalid = { sampleRate: 10, levels: [-1, 10, NaN] };
  assert.equal(audioEnvelopeLevel(invalid, 0), 0);
  assert.equal(audioEnvelopeLevel(invalid, 100), 1);
  assert.equal(audioEnvelopeLevel(invalid, 200), 0);
});

test("analysis rejects unbounded duration before starting the decoder", async () => {
  for (const duration of [0, -1, NaN, Infinity, 7200001])
    await assert.rejects(
      extractAudioEnvelope("not-opened.wav", duration),
      /duration/,
    );
});

test("silent PCM produces a silent envelope and leaves the source unchanged", async (t) => {
  if (!ffmpegAvailable) return t.skip("ffmpeg is unavailable");
  const source = await wav("silence.wav", 1, () => 0);
  const envelope = await extractAudioEnvelope(source.file, 1000);
  assert.equal(envelope.sampleRate, 30);
  assert.equal(envelope.levels.length, 30);
  assert.ok(envelope.levels.every((level) => level === 0));
  assert.deepEqual(await readFile(source.file), source.bytes);
});

test("real tone follows source timing, including trimmed playback offsets", async (t) => {
  if (!ffmpegAvailable) return t.skip("ffmpeg is unavailable");
  const source = await wav("silence-tone-silence.wav", 1.8, (time) =>
    time >= 0.6 && time < 1.2 ? 0.25 * Math.sin(2 * Math.PI * 220 * time) : 0,
  );
  const envelope = await extractAudioEnvelope(source.file, 1800);
  assert.equal(envelope.levels.length, 54);
  assert.equal(audioEnvelopeLevel(envelope, 300), 0);
  assert.ok(audioEnvelopeLevel(envelope, 900) > 0.95);
  assert.equal(audioEnvelopeLevel(envelope, 1500), 0);
  assert.equal(audioEnvelopeLevel(envelope, 1800), 0);
  assert.ok(envelope.levels.every((level) => level >= 0 && level <= 1));
  // The composition supplies clip.inMs + local playback time, never chapter time.
  const inMs = 600;
  assert.ok(audioEnvelopeLevel(envelope, inMs + 300) > 0.95);
  assert.equal(audioEnvelopeLevel(envelope, inMs + 900), 0);
  assert.deepEqual(await readFile(source.file), source.bytes);
});

test("louder recorded audio drives higher levels, and requested duration bounds decoding", async (t) => {
  if (!ffmpegAvailable) return t.skip("ffmpeg is unavailable");
  const source = await wav(
    "quiet-loud.wav",
    2,
    (time) => (time < 1 ? 0.05 : 0.5) * Math.sin(2 * Math.PI * 220 * time),
  );
  const full = await extractAudioEnvelope(source.file);
  assert.equal(full.levels.length, 60);
  assert.ok(audioEnvelopeLevel(full, 1500) > audioEnvelopeLevel(full, 500) * 2);
  const bounded = await extractAudioEnvelope(source.file, 500);
  assert.equal(bounded.levels.length, 15);
  assert.equal(audioEnvelopeLevel(bounded, 500), 0);
});

test("decoder failures are explicit, not fabricated audio activity", async (t) => {
  if (!ffmpegAvailable) return t.skip("ffmpeg is unavailable");
  const file = path.join(directory, "invalid.wav");
  await writeFile(file, "not an audio recording");
  await assert.rejects(extractAudioEnvelope(file, 1000), /could not decode/);
});
