import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";

// Operator-only generator for the four fictional hackathon demo films.
// Voices: the configured Time Tapestry interviewer asks, and an ElevenLabs
// library voice plays Gigi. Turn audio is cached under video/hackathon/media,
// so re-rendering never calls ElevenLabs again. Delete one turn's .mp3 and
// .json to regenerate just that turn. Finished films are never overwritten.
//
//   node --import tsx scripts/generate-hackathon-demo-films.ts \
//     --env-file "../Private.env" [--chapters 1,2] [--version v1]

const run = promisify(execFile);
const GIGI_VOICE_ID = process.env.HACKATHON_GIGI_VOICE_ID || "5u41aNhyCU6hXOcjPPv0"; // "Carol", ElevenLabs library
const MODEL_ID = "eleven_v3";
const GAP_MS = 650;
const LEAD_MS = 250;

function arg(name: string) {
  const args = process.argv.slice(2);
  return args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
}
const exists = (file: string) => access(file).then(() => true, () => false);
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

async function main() {
  const envFile = arg("--env-file");
  if (envFile) {
    for (const line of (await readFile(envFile, "utf8")).split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } else loadEnvConfig(process.cwd());
  const version = arg("--version") || "v1";
  if (!/^v[1-9][0-9]*$/.test(version)) throw new Error("Use --version v1.");
  const only = arg("--chapters")?.split(",").map(Number);

  // Remotion ships its own ffmpeg/ffprobe; the envelope helper spawns "ffmpeg".
  const compositor = path.dirname(
    createRequire(__filename).resolve("@remotion/compositor-darwin-arm64/package.json"),
  );
  process.env.PATH = `${compositor}:${process.env.PATH}`;
  process.env.DYLD_LIBRARY_PATH = compositor;

  const [{ hackathonDemoChapters, HACKATHON_DEMO_STORYTELLER }, { alignedWords }, { resolveInterviewerVoice }] =
    await Promise.all([
      import("../src/data/hackathon-demo"),
      import("../src/lib/collection/films/plan"),
      import("../src/lib/elevenlabs-client"),
    ]);
  const interviewer = await resolveInterviewerVoice();
  const voices = { interviewer: interviewer.voiceId, gigi: GIGI_VOICE_ID };

  const mediaDir = path.resolve(`video/hackathon/media/${version}`);
  const outDir = path.resolve(`public/hackathon-demo/films/${version}`);
  await mkdir(mediaDir, { recursive: true });
  await mkdir(outDir, { recursive: true });

  // Remotion serves staticFile() from one folder: stage the turn audio with the brand assets.
  const stage = await mkdtemp(path.join(os.tmpdir(), "hackathon-films-"));
  await copyFile("public/brand/film-closer-v2.mp4", path.join(stage, "closer.mp4"));
  await copyFile("public/brand/fonts/quicksand-latin.woff2", path.join(stage, "quicksand.woff2"));

  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
  const films = [];

  for (const chapter of hackathonDemoChapters) {
    if (only && !only.includes(chapter.number)) continue;
    const output = path.join(outDir, `chapter-${chapter.number}.mp4`);
    if (await exists(output)) {
      console.log(`Chapter ${chapter.number} film already exists. Use a new --version to replace it.`);
      continue;
    }
    let cursor = LEAD_MS;
    const turns = [];
    for (const [index, line] of chapter.conversation.entries()) {
      const base = path.join(mediaDir, `chapter-${chapter.number}-turn-${index + 1}`);
      const voiceId = voices[line.speaker];
      let bytes: Buffer;
      let alignment;
      if (await exists(`${base}.json`)) {
        const receipt = JSON.parse(await readFile(`${base}.json`, "utf8"));
        bytes = await readFile(`${base}.mp3`);
        if (receipt.text !== line.text || receipt.voiceId !== voiceId || receipt.audioSha256 !== sha256(bytes))
          throw new Error(`Turn ${base} changed. Delete its .mp3 and .json to regenerate it.`);
        alignment = receipt.alignment;
      } else {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
            body: JSON.stringify({
              text: line.text,
              model_id: MODEL_ID,
              voice_settings: { stability: 0.5 },
            }),
          },
        );
        if (!response.ok) throw new Error(`ElevenLabs returned HTTP ${response.status} for ${base}.`);
        const result = await response.json();
        bytes = Buffer.from(result.audio_base64, "base64");
        alignment = {
          characters: result.alignment.characters,
          characterStartTimesSeconds: result.alignment.character_start_times_seconds,
          characterEndTimesSeconds: result.alignment.character_end_times_seconds,
        };
        await writeFile(`${base}.mp3`, bytes, { flag: "wx" });
        await writeFile(
          `${base}.json`,
          JSON.stringify({ text: line.text, speaker: line.speaker, voiceId, modelId: MODEL_ID, audioSha256: sha256(bytes), alignment }),
          { flag: "wx" },
        );
        console.log(`Voiced chapter ${chapter.number}, turn ${index + 1} (${line.speaker}).`);
      }
      const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${base}.mp3`]);
      const durationMs = Math.round(Number(stdout.trim()) * 1000);
      // Captions show spoken words only, never the [chuckles]-style voice cues.
      const words = alignedWords(alignment, cursor).filter((word) => !/^\[.*\]$/.test(word.text));
      const name = path.basename(base) + ".mp3";
      await copyFile(`${base}.mp3`, path.join(stage, name));
      turns.push({
        speaker: line.speaker,
        audioSrc: name,
        startMs: cursor,
        durationMs,
        words,
        audioEnvelope: await envelope(`${base}.mp3`, path.join(stage, `${path.basename(base)}.wav`)),
      });
      cursor += durationMs + GAP_MS;
    }
    const conversationMs = cursor - GAP_MS + 400;
    films.push({ chapter, output, props: {
      chapterNumber: chapter.number,
      title: chapter.title,
      question: chapter.question,
      storytellerName: HACKATHON_DEMO_STORYTELLER.fullName,
      turns,
      conversationMs,
      closerSrc: "closer.mp4",
      fontSrc: "quicksand.woff2",
    } });
  }
  if (!films.length) return;

  const serveUrl = await bundle({ entryPoint: path.resolve("video/hackathon/index.tsx"), publicDir: stage });
  const manifestFile = path.join(outDir, "manifest.json");
  const manifest = (await exists(manifestFile)) ? JSON.parse(await readFile(manifestFile, "utf8")) : { version, films: {} };
  for (const { chapter, output, props } of films) {
    const composition = await selectComposition({ serveUrl, id: "HackathonDemoFilm", inputProps: props });
    await renderMedia({
      serveUrl, composition, inputProps: props, codec: "h264", audioCodec: "aac", crf: 22,
      outputLocation: output, overwrite: false, logLevel: "error",
      onProgress: ({ progress }) => { if (Math.round(progress * 100) % 25 === 0) process.stdout.write(".") },
    });
    const poster = path.join(outDir, `chapter-${chapter.number}-poster.jpg`);
    // The orb mid-sentence, a few seconds into Gigi's first answer.
    const gigiStart = props.turns.find((turn) => turn.speaker === "gigi")!.startMs;
    await renderStill({ serveUrl, composition, inputProps: props, output: poster, frame: Math.round(30 * 3 + ((gigiStart + 4000) / 1000) * 30), imageFormat: "jpeg", jpegQuality: 85, overwrite: true });
    const seconds = (composition.durationInFrames / composition.fps).toFixed(1);
    manifest.films[chapter.number] = {
      src: `/hackathon-demo/films/${version}/chapter-${chapter.number}.mp4`,
      poster: `/hackathon-demo/films/${version}/chapter-${chapter.number}-poster.jpg`,
      seconds: Number(seconds),
      voices: { interviewer: voices.interviewer, gigi: voices.gigi, modelId: MODEL_ID },
      sha256: sha256(await readFile(output)),
    };
    console.log(`\nRendered chapter ${chapter.number} (${seconds} s).`);
  }
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
}

/** Same 30 Hz RMS envelope as films/audio-envelope.ts. Remotion's bundled
 * ffmpeg has no raw PCM muxer, so decode to a 12 kHz mono WAV first. */
async function envelope(mp3: string, wav: string) {
  await run("ffmpeg", ["-nostdin", "-v", "error", "-i", mp3, "-ac", "1", "-ar", "12000", "-c:a", "pcm_s16le", "-f", "wav", "-y", wav]);
  const file = await readFile(wav);
  let offset = 12;
  while (file.toString("ascii", offset, offset + 4) !== "data") offset += 8 + file.readUInt32LE(offset + 4);
  const pcm = file.subarray(offset + 8, offset + 8 + file.readUInt32LE(offset + 4));
  const rms: number[] = [];
  for (let start = 0; start < pcm.length; start += 400 * 2) {
    let sum = 0, n = 0;
    for (let i = start; i + 1 < Math.min(pcm.length, start + 800); i += 2, n++) sum += (pcm.readInt16LE(i) / 32768) ** 2;
    rms.push(Math.sqrt(sum / n));
  }
  const silence = 0.001;
  const peak = Math.max(silence, ...rms);
  return {
    sampleRate: 30,
    levels: rms.map((level) => level <= silence ? 0 : Math.min(1, Math.sqrt((level - silence) / (peak - silence)))),
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
