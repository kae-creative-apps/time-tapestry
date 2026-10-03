import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
async function main() {
  const { resolveFilmVoice, narrateFilmChunk } = await import(
    process.cwd() + "/src/lib/collection/films/provider.ts"
  );
  const voice = await resolveFilmVoice();
  const scripts = [
    "Tell me about someone whose kindness has stayed with you. You can begin with one person or one small moment.",
    "Can you tell me about a time your faith shaped a choice you made? There is no perfect answer. Tell it in your own words.",
    "When you think about the time or money you gave to others, is there a story you would like someone you love to know? The meaning behind your generosity matters. Sharing an amount is your choice.",
  ];
  for (let i = 0; i < scripts.length; i++) {
    const result = await narrateFilmChunk(voice, scripts[i]);
    await writeFile(
      `public/brand/interview-preview-${i + 1}.mp3`,
      result.bytes,
    );
    console.log(
      `Saved public synthetic sample ${i + 1}: ${result.bytes.length} bytes`,
    );
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
