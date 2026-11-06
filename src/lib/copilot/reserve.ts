import { Prisma } from "@/generated/prisma/client";
import {
  checkSpendCaps,
  DEFAULT_FIRST_BUILD_CAP_USD,
  readCap,
  spendDecision,
  utcDayKey,
  type CapDecision,
} from "@/lib/copilot/caps";
import { recordUsageSpend } from "@/lib/credits/apply";
import { getPrisma } from "@/lib/db";

export async function reserveDailySpend(input: {
  repoId: string;
  estimateUsd: number;
  repoCapUsd: number;
  globalCapUsd: number;
  provider: "XAI" | "FAKE";
  model: string;
  jobId?: string;
  jobKind?: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT" | "SUMMARY_REFRESH";
  firstBuildCapUsd?: number;
  now?: Date;
}): Promise<CapDecision & { usageId?: string }> {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("DATABASE_URL is required to reserve spend");
  }
  const now = input.now ?? new Date();
  const day = new Date(`${utcDayKey(now)}T00:00:00.000Z`);
  return prisma.$transaction(
    async (tx) => {
      const [repoRows, globalSpent] = await Promise.all([
        tx.usageEntry.findMany({
          where: { repoId: input.repoId, day },
          select: {
            estimatedCostUsd: true,
            job: { select: { kind: true } },
          },
        }),
        tx.usageEntry.aggregate({
          where: { day },
          _sum: { estimatedCostUsd: true },
        }),
      ]);
      let repoSpentUsd = 0;
      let firstBuildSpentUsd = 0;
      for (const row of repoRows) {
        const cost = Number(row.estimatedCostUsd);
        if (row.job?.kind === "FIRST_BUILD") firstBuildSpentUsd += cost;
        else repoSpentUsd += cost;
      }
      const decision =
        input.jobKind === "FIRST_BUILD"
          ? spendDecision({
              jobKind: "FIRST_BUILD",
              repoSpentUsd,
              firstBuildSpentUsd,
              globalSpentUsd: Number(globalSpent._sum.estimatedCostUsd ?? 0),
              repoCapUsd: input.repoCapUsd,
              firstBuildCapUsd:
                input.firstBuildCapUsd ??
                readCap(process.env.FIRST_BUILD_CAP_USD, DEFAULT_FIRST_BUILD_CAP_USD),
              globalCapUsd: input.globalCapUsd,
              nextJobEstimateUsd: input.estimateUsd,
            })
          : checkSpendCaps({
              repoSpentUsd: input.jobKind ? repoSpentUsd : repoSpentUsd + firstBuildSpentUsd,
              globalSpentUsd: Number(globalSpent._sum.estimatedCostUsd ?? 0),
              repoCapUsd: input.repoCapUsd,
              globalCapUsd: input.globalCapUsd,
              nextJobEstimateUsd: input.estimateUsd,
            });
      if (!decision.allowed) return decision;
      const row = await tx.usageEntry.create({
        data: {
          repoId: input.repoId,
          day,
          provider: input.provider,
          model: input.model,
          status: "RESERVED",
          estimatedCostUsd: input.estimateUsd,
          jobId: input.jobId,
        },
      });
      return { allowed: true as const, usageId: row.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function finalizeUsage(input: {
  usageId: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.usageEntry.update({
    where: { id: input.usageId },
    data: {
      status: "FINAL",
      promptTokens: Math.max(0, Math.trunc(input.promptTokens)),
      completionTokens: Math.max(0, Math.trunc(input.completionTokens)),
      estimatedCostUsd: Math.max(0, input.estimatedCostUsd),
    },
  });
  await recordUsageSpend(input.usageId);
}

export async function releaseUsage(usageId: string | undefined): Promise<void> {
  if (!usageId) return;
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.usageEntry.deleteMany({ where: { id: usageId, status: "RESERVED" } });
}

export async function releaseUsageForJob(jobId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  await prisma.usageEntry.deleteMany({ where: { jobId, status: "RESERVED" } });
}
