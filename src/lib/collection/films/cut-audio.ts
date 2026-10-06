import { open, mkdir, readFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  clipAudioSamples,
  clipTiming,
  VIDEO_FPS,
  CUT_AUDIO_SAMPLE_RATE,
  type VideoClip,
} from "../../video-plan";
import { fileHash, privateJson } from "./render";
import { sha256 } from "./plan";

/** Read only the RIFF directory, not the recording, into memory. */
async function pcmLayout(file: string) {
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    if (
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new Error(
        "Cut smoothing requires the preserved 48kHz PCM working copy.",
      );
    let channels = 0,
      blockAlign = 0,
      dataStart = 0,
      dataBytes = 0;
    for (let position = 12; position + 8 <= size;) {
      const chunk = Buffer.alloc(8);
      await handle.read(chunk, 0, 8, position);
      const kind = chunk.toString("ascii", 0, 4),
        length = chunk.readUInt32LE(4);
      if (position + 8 + length > size)
        throw new Error("The PCM working copy is truncated.");
      if (kind === "fmt ") {
        if (length < 16 || length > 65536)
          throw new Error("The PCM working format is invalid.");
        const format = Buffer.alloc(length);
        await handle.read(format, 0, length, position + 8);
        const encoding = format.readUInt16LE(0);
        channels = format.readUInt16LE(2);
        blockAlign = format.readUInt16LE(12);
        const pcm =
          encoding === 1 ||
          (encoding === 65534 && length >= 40 && format.readUInt16LE(24) === 1);
        if (
          !pcm ||
          format.readUInt32LE(4) !== CUT_AUDIO_SAMPLE_RATE ||
          format.readUInt16LE(14) !== 16 ||
          channels < 1 ||
          channels > 32 ||
          blockAlign !== channels * 2
        )
          throw new Error("Cut smoothing requires 16-bit, 48kHz PCM audio.");
      } else if (kind === "data") {
        dataStart = position + 8;
        dataBytes = length;
      }
      position += 8 + length + (length % 2);
    }
    if (!channels || !dataStart || !dataBytes || dataBytes % blockAlign)
      throw new Error("The PCM working copy has no complete audio samples.");
    return { channels, blockAlign, dataStart, samples: dataBytes / blockAlign };
  } finally {
    await handle.close();
  }
}

/**
 * Sample-level fades inside retained handles, never a crossfade between words.
 * The existing full-source PCM copy makes even hundreds of cuts direct byte
 * ranges, rather than hundreds of source decodes or a growing in-memory buffer.
 */
export async function prepareCutAudio(
  sourceFile: string,
  sourceSha256: string,
  clip: VideoClip,
  work: string,
  assertCurrent: () => Promise<void> = async () => {},
): Promise<{
  file: string;
  metadata: NonNullable<VideoClip["audioDerivative"]>;
}> {
  const timing = clipTiming(clip),
    samples = clipAudioSamples(clip);
  const spec = {
    version: "pcm-declick-v1",
    sourceSha256,
    ...timing,
    ...samples,
  };
  const id = `cut-audio-${sha256(JSON.stringify(spec))}`;
  await mkdir(work, { recursive: true, mode: 0o700 });
  const file = path.join(work, `${id}.wav`),
    receiptFile = `${file}.json`;
  const metadata = (
    hash: string,
  ): NonNullable<VideoClip["audioDerivative"]> => ({
    assetId: id,
    relativePath: `${id}.wav`,
    sha256: hash,
    sampleRate: CUT_AUDIO_SAMPLE_RATE,
    sampleCount: samples.sampleCount,
    startFrame: timing.startFrame,
    endFrame: timing.endFrame,
    fadeInSamples: samples.fadeInSamples,
    fadeOutSamples: samples.fadeOutSamples,
  });
  await assertCurrent();
  try {
    const saved = JSON.parse(await readFile(receiptFile, "utf8"));
    if (
      saved.specSha256 === sha256(JSON.stringify(spec)) &&
      saved.outputSha256 === (await fileHash(file))
    )
      return { file, metadata: metadata(saved.outputSha256) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const layout = await pcmLayout(sourceFile);
  const startSample = timing.startFrame * (CUT_AUDIO_SAMPLE_RATE / VIDEO_FPS);
  if (
    startSample >= layout.samples ||
    startSample + samples.sampleCount >
      layout.samples + CUT_AUDIO_SAMPLE_RATE / VIDEO_FPS
  )
    throw new Error(
      "The audio working copy does not cover this exact source interval.",
    );
  const dataBytes = samples.sampleCount * layout.blockAlign;
  if (dataBytes + 36 > 0xffffffff)
    throw new Error("A cut exceeds the PCM derivative size limit.");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataBytes + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(layout.channels, 22);
  header.writeUInt32LE(CUT_AUDIO_SAMPLE_RATE, 24);
  header.writeUInt32LE(CUT_AUDIO_SAMPLE_RATE * layout.blockAlign, 28);
  header.writeUInt16LE(layout.blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  const input = await open(sourceFile, "r"),
    output = await open(temporary, "wx", 0o600);
  try {
    await output.writeFile(header);
    const batchSamples = 8192;
    for (let offset = 0; offset < samples.sampleCount; offset += batchSamples) {
      if (offset % (batchSamples * 256) === 0) await assertCurrent();
      const count = Math.min(batchSamples, samples.sampleCount - offset);
      const buffer = Buffer.alloc(count * layout.blockAlign);
      const available =
        Math.min(count, Math.max(0, layout.samples - startSample - offset)) *
        layout.blockAlign;
      let read = 0;
      while (read < available) {
        const result = await input.read(
          buffer,
          read,
          available - read,
          layout.dataStart + (startSample + offset) * layout.blockAlign + read,
        );
        if (!result.bytesRead)
          throw new Error("The audio working copy changed during smoothing.");
        read += result.bytesRead;
      }
      for (let sample = 0; sample < count; sample++) {
        const index = offset + sample;
        const gain = Math.min(
          samples.fadeInSamples > 0
            ? Math.min(1, index / samples.fadeInSamples)
            : 1,
          samples.fadeOutSamples > 0
            ? Math.min(
                1,
                (samples.sampleCount - 1 - index) / samples.fadeOutSamples,
              )
            : 1,
        );
        if (gain === 1) continue;
        for (let channel = 0; channel < layout.channels; channel++) {
          const byte = sample * layout.blockAlign + channel * 2;
          buffer.writeInt16LE(
            Math.round(buffer.readInt16LE(byte) * gain),
            byte,
          );
        }
      }
      await output.writeFile(buffer);
    }
    await assertCurrent();
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await Promise.all([input.close(), output.close()]);
  }
  const outputSha256 = await fileHash(temporary);
  await rename(temporary, file);
  await privateJson(receiptFile, {
    specSha256: sha256(JSON.stringify(spec)),
    outputSha256,
    ...spec,
  });
  return { file, metadata: metadata(outputSha256) };
}

/** Analyze an already-shaped PCM cut directly, without one decoder per cut. */
export async function cutAudioEnvelope(file: string, expectedSamples: number) {
  const layout = await pcmLayout(file);
  if (
    layout.samples !== expectedSamples ||
    expectedSamples > 3600 * CUT_AUDIO_SAMPLE_RATE
  )
    throw new Error("The cut audio envelope does not match its frame budget.");
  const input = await open(file, "r");
  const levels: number[] = [];
  try {
    for (
      let start = 0;
      start < layout.samples;
      start += CUT_AUDIO_SAMPLE_RATE / VIDEO_FPS
    ) {
      const count = Math.min(
        CUT_AUDIO_SAMPLE_RATE / VIDEO_FPS,
        layout.samples - start,
      );
      const buffer = Buffer.alloc(count * layout.blockAlign);
      let read = 0;
      while (read < buffer.length) {
        const result = await input.read(
          buffer,
          read,
          buffer.length - read,
          layout.dataStart + start * layout.blockAlign + read,
        );
        if (!result.bytesRead)
          throw new Error("A cut changed during envelope analysis.");
        read += result.bytesRead;
      }
      let sum = 0;
      for (let sample = 0; sample < count; sample++) {
        let mono = 0;
        for (let channel = 0; channel < layout.channels; channel++)
          mono +=
            buffer.readInt16LE(sample * layout.blockAlign + channel * 2) /
            32768 /
            layout.channels;
        sum += mono * mono;
      }
      levels.push(Math.sqrt(sum / count));
    }
  } finally {
    await input.close();
  }
  let peak = 0.001;
  for (const value of levels) peak = Math.max(peak, value);
  return {
    sampleRate: VIDEO_FPS,
    levels: levels.map((value) =>
      value <= 0.001
        ? 0
        : Math.min(1, Math.sqrt((value - 0.001) / (peak - 0.001))),
    ),
  };
}
