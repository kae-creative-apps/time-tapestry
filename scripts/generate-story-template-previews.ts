import { loadEnvConfig } from "@next/env";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Fictional examples only. Never pass collection content into this public asset generator.
const stories = [
  "When my children were small, our neighbor would leave a warm meal at the door. She never made us feel like a burden. I remember that more than what she cooked. She taught me that kindness often begins with simply noticing.",
  "My faith grew around our kitchen table. We prayed about the things we could not fix, and then asked who we could help that day. I did not always have an answer. But I learned that trusting God could begin with one small, faithful step.",
  "For years, I drove a friend to her appointments. We talked, or sometimes we just sat quietly together. At the time, it felt like an ordinary part of my week. Looking back, I think giving someone your time is one way of telling them they matter.",
  "I hope you make room for people. Leave a chair at your table. Notice who might need a phone call. You will not always know the difference you have made, and that is all right. Keep giving what you can, with a willing heart.",
];

async function main() {
  const args = process.argv.slice(2);
  const envDir = args.includes("--env-dir")
    ? args[args.indexOf("--env-dir") + 1]
    : process.cwd();
  const version = args.includes("--version")
    ? args[args.indexOf("--version") + 1]
    : "v1";
  if (!envDir || !/^v[1-9][0-9]*$/.test(version))
    throw new Error("Use --version v1 and an optional --env-dir directory.");
  loadEnvConfig(path.resolve(envDir), false, { info() {}, error() {} });
  const [
    { resolveFilmVoice, narrateFilmChunk },
    { alignedWords, sha256, FILM_TEMPLATE_VERSION },
    { probeFilm },
    { extractAudioEnvelope },
    { CHAPTERS },
  ] = await Promise.all([
    import("../src/lib/collection/films/provider"),
    import("../src/lib/collection/films/plan"),
    import("../src/lib/collection/films/render"),
    import("../src/lib/collection/films/audio-envelope"),
    import("../src/lib/interview-state"),
  ]);
  const folder = path.resolve(`public/brand/story-templates-${version}`);
  const manifestFile = path.join(folder, "manifest.json");
  if (
    await access(manifestFile).then(
      () => true,
      () => false,
    )
  )
    throw new Error(
      "This preview version already exists. Choose a new version.",
    );
  await mkdir(folder, { recursive: true });
  const voice = await resolveFilmVoice();
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const script = `An illustrative story, read by the Time Tapestry AI interviewer. ${stories[i]}`;
    const receiptFile = path.join(folder, `chapter-${i + 1}.json`);
    const audioFile = path.join(folder, `chapter-${i + 1}.mp3`);
    let result: {
      bytes: Buffer;
      alignment: Parameters<typeof alignedWords>[0];
    };
    if (
      await access(receiptFile).then(
        () => true,
        () => false,
      )
    ) {
      const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
      const bytes = await readFile(audioFile);
      if (
        receipt.script !== script ||
        receipt.voiceId !== voice.voiceId ||
        receipt.audioSha256 !== sha256(bytes)
      )
        throw new Error(
          "An existing sample does not match. Use a new preview version.",
        );
      result = { bytes, alignment: receipt.alignment };
    } else {
      if (
        await access(audioFile).then(
          () => true,
          () => false,
        )
      )
        throw new Error(
          "An incomplete sample already exists. Use a new preview version.",
        );
      result = await narrateFilmChunk(voice, script);
      await writeFile(audioFile, result.bytes, { flag: "wx" });
      await writeFile(
        receiptFile,
        JSON.stringify({
          script,
          voiceId: voice.voiceId,
          audioSha256: sha256(result.bytes),
          alignment: result.alignment,
        }),
        { flag: "wx" },
      );
    }
    const measured = await probeFilm(audioFile);
    const audioDurationMs = Math.round(measured.durationSeconds * 1000);
    samples.push({
      audioPath: `brand/story-templates-${version}/chapter-${i + 1}.mp3`,
      audioEnvelope: await extractAudioEnvelope(audioFile, audioDurationMs),
      plan: {
        schemaVersion: 1,
        jobId: `template-preview-${version}-${i + 1}`,
        chapterId: CHAPTERS[i].id,
        chapterNumber: i + 1,
        storytellerName: "Evelyn · Illustrative story",
        title: CHAPTERS[i].title,
        script,
        sourceTakeIds: ["fictional-template-example"],
        sourceSha256: sha256(stories[i]),
        scriptSha256: sha256(script),
        audioSha256: sha256(result.bytes),
        audioDurationMs,
        words: alignedWords(result.alignment, 0),
        narrationKind: "ai_interviewer",
        templateVersion: FILM_TEMPLATE_VERSION,
      },
    });
    console.log(
      `Prepared template ${i + 1} of 4 (${measured.durationSeconds.toFixed(1)} seconds of sample narration).`,
    );
  }
  await writeFile(
    manifestFile,
    JSON.stringify(
      {
        version,
        voiceId: voice.voiceId,
        modelId: voice.modelId,
        settings: voice.settings,
        disclosure:
          "All four stories are fictional examples voiced by the configured Time Tapestry interviewer.",
        samples,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    "Saved four public fictional previews. No collection data or credentials were included.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Preview generation failed.",
  );
  process.exitCode = 1;
});
