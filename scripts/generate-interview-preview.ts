import { loadEnvConfig } from "@next/env";
import { access, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
loadEnvConfig(process.cwd());
async function main() {
  const { resolveFilmVoice, narrateFilmChunk } = await import(
    process.cwd() + "/src/lib/collection/films/provider.ts"
  );
  const voice = await resolveFilmVoice();
  const version = process.env.INTERVIEW_PREVIEW_VERSION || "v2";
  if (!/^v[1-9][0-9]*$/.test(version))
    throw new Error("Choose a version such as v2 for the preview samples.");
  const scripts = [
    "Tell me about someone whose kindness has stayed with you. You can begin with one person or one small moment.",
    "Can you tell me about a time your faith shaped a choice you made? There is no perfect answer. Tell it in your own words.",
    "When you think about the time or money you gave to others, is there a story you would like someone you love to know? The meaning behind your generosity matters. Sharing an amount is your choice.",
  ];
  const files = scripts.map((_, i) => `public/brand/interview-preview-${version}-${i + 1}.mp3`);
  const manifestPath = `public/brand/interview-preview-${version}.json`;
  for (const file of [...files, manifestPath]) {
    const exists = await access(file).then(() => true, () => false);
    if (exists) throw new Error("This preview version already exists. Choose a new version instead of overwriting it.");
  }
  const samples = [];
  for (let i = 0; i < scripts.length; i++) {
    const result = await narrateFilmChunk(voice, scripts[i]);
    samples.push({ bytes: result.bytes, text: scripts[i], path: files[i] });
  }
  for (const sample of samples) await writeFile(sample.path, sample.bytes, { flag: "wx" });
  await writeFile(manifestPath, JSON.stringify({
    version,
    generatedAt: new Date().toISOString(),
    voiceId: voice.voiceId,
    modelId: voice.modelId,
    settings: voice.settings,
    source: "Configured Time Tapestry ElevenLabs interviewer",
    samples: samples.map(({path, text, bytes}) => ({
      path: path.replace(/^public/, ""), text,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  }, null, 2), { flag: "wx" });
  console.log(`Saved ${samples.length} versioned interviewer samples and their voice manifest.`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
