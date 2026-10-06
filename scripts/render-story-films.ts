import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const id = process.argv.find((value) => value.startsWith("--job="))?.slice(6);
  if (!id)
    throw new Error(
      "Provide --job=film_HASH for an already approved queued job. Use the private review page to approve processing of your original recordings first.",
    );
  const { getFilmJob, claimNextFilmJob, writeWorkerHeartbeat } =
    await import("../src/lib/collection/films/jobstore");
  const { processFilmJob } = await import("../src/lib/collection/films/worker");
  const workerId = `manual-${process.pid}`;
  const expected = await getFilmJob(id);
  if (!expected || expected.status !== "queued")
    throw new Error("That approved film job is not queued.");
  await writeWorkerHeartbeat(workerId);
  const job = await claimNextFilmJob(workerId, Date.now(), id);
  if (!job || job.id !== id) throw new Error("Another worker owns this job.");
  const heartbeat = setInterval(() => {
    void writeWorkerHeartbeat(workerId).catch(() => {});
  }, 20000);
  try {
    const result = await processFilmJob(job);
    console.log(
      JSON.stringify(
        {
          jobId: result?.id,
          status: result?.status,
          chapters: result?.chapters.map((chapter) => ({
            chapter: chapter.chapterNumber,
            status: chapter.status,
            durationSeconds: chapter.artifact?.durationSeconds,
          })),
        },
        null,
        2,
      ),
    );
    if (result?.status !== "ready") process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Film rendering failed.",
  );
  process.exitCode = 1;
});
