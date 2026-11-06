import { Prisma, type Job } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import type { WorkerConfig } from "@/worker/config";

export type ClaimedJob = Job & { chatInstructionLength: number | null };

export function isHeavyJob(job: Pick<Job, "kind"> & { chatInstructionLength?: number | null }): boolean {
  return (
    job.kind === "FIRST_BUILD" ||
    (job.kind === "CHAT_EDIT" && (job.chatInstructionLength ?? 0) > 2_000)
  );
}

export async function claimNextJob(
  config: WorkerConfig,
  options: { allowHeavy: boolean },
): Promise<ClaimedJob | null> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  return prisma.$transaction(async (tx) => {
    const leaseUntil = new Date(Date.now() + config.leaseMs);
    const rows = await tx.$queryRaw<ClaimedJob[]>`
      WITH candidate AS (
        SELECT j.id
        FROM "Job" j
        WHERE j.status = 'QUEUED'::"JobStatus"
          AND j."availableAt" <= now()
          AND j.attempts < j."maxAttempts"
          AND NOT EXISTS (
            SELECT 1 FROM "Job" running
            WHERE running."repoId" = j."repoId"
              AND running.status = 'RUNNING'::"JobStatus"
          )
          AND (
            ${options.allowHeavy}::boolean = true
            OR (
              j.kind <> 'FIRST_BUILD'::"JobKind"
              AND NOT (
                j.kind = 'CHAT_EDIT'::"JobKind"
                AND EXISTS (
                  SELECT 1
                  FROM "ChatEdit" ce
                  WHERE ce."jobId" = j.id AND LENGTH(ce.instruction) > 2000
                )
              )
            )
          )
        ORDER BY j."createdAt" ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
      )
      UPDATE "Job" AS j
      SET status = 'RUNNING'::"JobStatus",
          phase = 'QUEUED'::"JobPhase",
          progress = 0,
          detail = NULL,
          error = NULL,
          attempts = j.attempts + 1,
          "availableAt" = now(),
          "leaseUntil" = ${leaseUntil},
          "lockedBy" = ${config.workerId},
          "lastHeartbeatAt" = now(),
          "startedAt" = COALESCE(j."startedAt", now()),
          "finishedAt" = NULL
      FROM candidate
      WHERE j.id = candidate.id
      RETURNING j.*, (
        SELECT LENGTH(ce2.instruction)
        FROM "ChatEdit" ce2
        WHERE ce2."jobId" = j.id
      ) AS "chatInstructionLength"
    `;
    return rows[0] ?? null;
  });
}

export async function heartbeat(
  jobId: string,
  workerId: string,
  leaseMs: number,
): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "RUNNING", lockedBy: workerId },
    data: {
      lastHeartbeatAt: new Date(),
      leaseUntil: new Date(Date.now() + leaseMs),
    },
  });
  return result.count === 1;
}

export async function assertOwnership(
  jobId: string,
  workerId: string,
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true, lockedBy: true },
  });
  if (!job || job.status !== "RUNNING" || job.lockedBy !== workerId) {
    throw new Error("This worker no longer owns the job.");
  }
}

export async function finishJob(args: {
  jobId: string;
  workerId: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  successMessage: string;
}): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  const result = await prisma.job.updateMany({
    where: { id: args.jobId, status: "RUNNING", lockedBy: args.workerId },
    data: {
      status: "SUCCEEDED",
      phase: "COMPLETE",
      progress: 100,
      detail: args.successMessage,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      estimatedCostUsd: args.estimatedCostUsd,
      finishedAt: new Date(),
      lockedBy: null,
      leaseUntil: null,
    },
  });
  return result.count === 1;
}

export async function failOrRetryJob(args: {
  jobId: string;
  workerId: string;
  error: string;
  permanent: boolean;
}): Promise<"failed" | "retried" | "missing"> {
  const prisma = getPrisma();
  if (!prisma) return "missing";
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: args.jobId },
      select: {
        attempts: true,
        maxAttempts: true,
        status: true,
        lockedBy: true,
      },
    });
    if (!job) return "missing";
    if (job.status !== "RUNNING" || job.lockedBy !== args.workerId) {
      return "missing";
    }
    if (args.permanent || job.attempts >= job.maxAttempts) {
      await tx.job.update({
        where: { id: args.jobId },
        data: {
          status: "FAILED",
          error: args.error,
          detail: "Build failed",
          finishedAt: new Date(),
          lockedBy: null,
          leaseUntil: null,
        },
      });
      return "failed";
    }
    const delayMs = Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, job.attempts - 1));
    await tx.job.update({
      where: { id: args.jobId },
      data: {
        status: "QUEUED",
        phase: "QUEUED",
        progress: 0,
        detail: "Waiting to retry",
        error: args.error,
        availableAt: new Date(Date.now() + delayMs),
        lockedBy: null,
        leaseUntil: null,
      },
    });
    return "retried";
  });
}

export async function retryFailedJob(jobId: string): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  return prisma.$transaction(
    async (tx) => {
      const result = await tx.job.updateMany({
        where: { id: jobId, status: "FAILED" },
        data: {
          status: "QUEUED",
          phase: "QUEUED",
          detail: "Continuing",
          error: null,
          attempts: 0,
          availableAt: new Date(),
          startedAt: null,
          finishedAt: null,
          lockedBy: null,
          leaseUntil: null,
          lastHeartbeatAt: null,
        },
      });
      if (result.count !== 1) return false;
      await tx.usageEntry.deleteMany({
        where: { jobId, status: "RESERVED" },
      });
      return true;
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}

export async function reapExpiredJobs(): Promise<{
  failed: number;
  retried: number;
}> {
  const prisma = getPrisma();
  if (!prisma) return { failed: 0, retried: 0 };
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "UsageEntry"
    WHERE status = 'RESERVED'::"UsageStatus"
      AND "jobId" IN (
        SELECT id FROM "Job"
        WHERE status = 'RUNNING'::"JobStatus"
          AND "leaseUntil" IS NOT NULL
          AND "leaseUntil" < now()
      )
  `);
  const failed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Job"
    SET status = 'FAILED'::"JobStatus",
        error = 'The worker stopped before the job finished.',
        detail = 'Build failed',
        "finishedAt" = now(),
        "lockedBy" = NULL,
        "leaseUntil" = NULL
    WHERE status = 'RUNNING'::"JobStatus"
      AND "leaseUntil" IS NOT NULL
      AND "leaseUntil" < now()
      AND attempts >= "maxAttempts"
  `);
  const retried = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Job"
    SET status = 'QUEUED'::"JobStatus",
        phase = 'QUEUED'::"JobPhase",
        progress = 0,
        detail = 'Waiting to retry',
        error = 'The worker stopped before the job finished.',
        "availableAt" = now(),
        "lockedBy" = NULL,
        "leaseUntil" = NULL
    WHERE status = 'RUNNING'::"JobStatus"
      AND "leaseUntil" IS NOT NULL
      AND "leaseUntil" < now()
      AND attempts < "maxAttempts"
  `);
  return { failed, retried };
}
