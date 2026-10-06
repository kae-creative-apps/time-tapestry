import { loadEnvConfig } from "@next/env";
import {
  preflightFilmWorker,
  WorkerStartupError,
} from "../src/lib/collection/films/runtime-config";
loadEnvConfig(process.cwd());

async function main() {
  let stopping = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let heartbeatWrite = Promise.resolve();
  let wakePoll: (() => void) | undefined;
  let deliveryTimer: ReturnType<typeof setInterval> | undefined;
  let deliveryWrite = Promise.resolve();
  let deliveryRunning = false;
  const stop = () => {
    stopping = true;
    clearInterval(heartbeat);
    clearInterval(deliveryTimer);
    wakePoll?.();
  };
  const handleSignal = () => {
    if (!stopping)
      console.log("Story film worker is stopping after its current job.");
    stop();
  };
  process.on("SIGTERM", handleSignal);
  process.on("SIGINT", handleSignal);
  try {
    // Hosted preflight pins process temp directories to the guarded data volume
    // before Remotion and the worker can cache a system temporary path.
    const config = await preflightFilmWorker();
    if (stopping) return;
    if (
      process.argv.includes("--check") ||
      process.argv.includes("--preflight")
    ) {
      console.log(
        `Story film worker ${config.hosted ? "hosted" : "local"} preflight passed. No jobs were polled and no providers were called.`,
      );
      return;
    }
    const { runFilmWorkerOnce } =
      await import("../src/lib/collection/films/worker");
    const { writeWorkerHeartbeat } =
      await import("../src/lib/collection/films/jobstore");
    const { runInterviewPreparationOnce } =
      await import("../src/lib/collection/interview-preparation");
    const { runLivingStoryWorkerOnce } =
      await import("../src/lib/collection/living-story-worker");
    const { processDeliveryJobs, emailDeliveryEnabled, postalDeliveryEnabled } =
      await import("../src/lib/collection/delivery");
    const workerId = `${config.hosted ? "hosted" : "local"}-${process.pid}`;
    if (stopping) return;
    await writeWorkerHeartbeat(workerId);
    if (stopping) return;
    heartbeat = setInterval(() => {
      heartbeatWrite = heartbeatWrite
        .then(async () => {
          if (!stopping) await writeWorkerHeartbeat(workerId);
        })
        .catch(() => {
          console.error(
            "Story film worker heartbeat failed. Stopping before another job; current job progress is preserved.",
          );
          process.exitCode = 1;
          stop();
        });
    }, 20000);
    // Run alongside long renders. A render must not postpone an email retry
    // beyond the provider's idempotency window. Existing enable flags still apply.
    const deliveryTick = () => {
      if (
        stopping ||
        deliveryRunning ||
        (!emailDeliveryEnabled() && !postalDeliveryEnabled())
      )
        return;
      deliveryRunning = true;
      deliveryWrite = processDeliveryJobs()
        .then(() => {})
        .catch(() => {
          console.error(
            "Delivery processing could not finish. Saved requests will be checked on the next pass.",
          );
        })
        .finally(() => {
          deliveryRunning = false;
        });
    };
    deliveryTick();
    if (!process.argv.includes("--once"))
      deliveryTimer = setInterval(deliveryTick, 60000);
    console.log(
      "Story film worker is ready. Consented interview preparation and original-recording film jobs are processed.",
    );
    while (!stopping) {
      const preparation = await runInterviewPreparationOnce(workerId, {
        shouldStop: () => stopping,
      });
      if (preparation)
        console.log(
          `Interview preparation ${preparation.id.slice(0, 18)}: ${preparation.status}`,
        );
      if (stopping) break;
      const job = await runFilmWorkerOnce(workerId, {
        shouldStop: () => stopping,
      });
      if (job) console.log(`Film job ${job.id.slice(0, 18)}: ${job.status}`);
      if (stopping) break;
      const moment = await runLivingStoryWorkerOnce(workerId, {
        shouldStop: () => stopping,
      });
      if (moment)
        console.log(`Living story ${moment.id.slice(0, 18)}: ${moment.status}`);
      if (process.argv.includes("--once")) break;
      if (!stopping)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wakePoll = undefined;
            resolve();
          }, 3000);
          wakePoll = () => {
            clearTimeout(timer);
            wakePoll = undefined;
            resolve();
          };
        });
    }
  } finally {
    stop();
    await heartbeatWrite;
    await deliveryWrite;
    process.off("SIGTERM", handleSignal);
    process.off("SIGINT", handleSignal);
  }
}
main().catch((error) => {
  console.error(
    error instanceof WorkerStartupError
      ? error.message
      : "The film worker stopped. Check storage and provider configuration; job progress is preserved.",
  );
  process.exitCode = 1;
});
