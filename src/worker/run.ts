import type { WorkerConfig } from "@/worker/config";
import { runJob } from "@/worker/dispatch";
import { classifyJobError, safeErrorMessage } from "@/worker/errors";
import { logJobEvent } from "@/worker/events";
import {
  claimNextJob,
  failOrRetryJob,
  isHeavyJob,
  reapExpiredJobs,
} from "@/worker/queue";

export async function runWorker(config: WorkerConfig): Promise<void> {
  let stopping = false;
  let active = 0;
  let activeHeavy = 0;
  const jobs = new Map<string, boolean>();

  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  const reaper = setInterval(() => {
    void reapExpiredJobs()
      .then(({ failed, retried }) => {
        if (failed || retried) {
          console.info(`Worker reaped ${failed} failed and ${retried} retried jobs.`);
        }
      })
      .catch((error) => {
        console.error(`Worker reaper failed: ${safeErrorMessage(error)}`);
      });
  }, config.reaperMs);
  reaper.unref?.();

  console.info(
    `Worker ${config.workerId} started with concurrency ${config.concurrency} and heavy limit ${config.maxConcurrentHeavy}.`,
  );

  try {
    while (!stopping) {
      while (!stopping && jobs.size < config.concurrency) {
        const job = await claimNextJob(config, {
          allowHeavy: activeHeavy < config.maxConcurrentHeavy,
        }).catch((error) => {
          console.error(`Worker claim failed: ${safeErrorMessage(error)}`);
          return null;
        });
        if (!job) break;
        const heavy = isHeavyJob(job);
        jobs.set(job.id, heavy);
        active += 1;
        if (heavy) activeHeavy += 1;
        void execute(job.id, config)
          .catch((error) => {
            console.error(`Worker job ${job.id} crashed: ${safeErrorMessage(error)}`);
          })
          .finally(() => {
            jobs.delete(job.id);
            active -= 1;
            if (heavy) activeHeavy -= 1;
          });
      }
      await sleep(config.pollMs);
    }
    while (active > 0) {
      await sleep(250);
    }
  } finally {
    clearInterval(reaper);
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

async function execute(jobId: string, config: WorkerConfig): Promise<void> {
  try {
    await runJob(jobId, config);
  } catch (error) {
    const classified = classifyJobError(error);
    const outcome = await failOrRetryJob({
      jobId,
      workerId: config.workerId,
      error: classified.message,
      permanent: classified.permanent,
    }).catch((failure) => {
      console.error(`Worker could not record failure: ${safeErrorMessage(failure)}`);
      return "missing" as const;
    });
    if (outcome === "missing") return;
    await logJobEvent({
      jobId,
      level: "error",
      message:
        outcome === "retried"
          ? `Attempt failed. Retrying. ${classified.message}`
          : `Build failed. ${classified.message}`,
      detail: outcome === "retried" ? "Waiting to retry" : "Build failed",
      metadata: { role: "reply" },
    }).catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
