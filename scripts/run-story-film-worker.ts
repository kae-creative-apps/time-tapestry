import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { runFilmWorkerOnce } =
    await import("../src/lib/collection/films/worker");
  const { writeWorkerHeartbeat } =
    await import("../src/lib/collection/films/jobstore");
  const workerId = `local-${process.pid}`;
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  const heartbeat = setInterval(() => {
    void writeWorkerHeartbeat(workerId).catch(() => {});
  }, 20000);
  console.log(
    "Story film worker is ready. Only approved queued scripts are processed.",
  );
  try {
    do {
      const job = await runFilmWorkerOnce(workerId);
      if (job) console.log(`Film job ${job.id.slice(0, 18)}: ${job.status}`);
      if (process.argv.includes("--once")) break;
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000));
    } while (!stopping);
  } finally {
    clearInterval(heartbeat);
  }
}
main().catch(() => {
  console.error(
    "The film worker stopped. Check storage and provider configuration; job progress is preserved.",
  );
  process.exitCode = 1;
});
