export type CapReason = "repo_daily_cap" | "global_daily_cap";

export type CapDecision =
  | { allowed: true }
  | { allowed: false; reason: CapReason };

export function checkSpendCaps(input: {
  repoSpentUsd: number;
  globalSpentUsd: number;
  repoCapUsd: number;
  globalCapUsd: number;
  nextJobEstimateUsd: number;
}): CapDecision {
  if (
    input.nextJobEstimateUsd < 0 ||
    input.repoSpentUsd < 0 ||
    input.globalSpentUsd < 0 ||
    input.repoCapUsd < 0 ||
    input.globalCapUsd < 0
  ) {
    throw new Error("cap amounts must be zero or greater");
  }
  const repoNext = input.repoSpentUsd + input.nextJobEstimateUsd;
  if (repoNext > input.repoCapUsd) {
    return { allowed: false, reason: "repo_daily_cap" };
  }
  const globalNext = input.globalSpentUsd + input.nextJobEstimateUsd;
  if (globalNext > input.globalCapUsd) {
    return { allowed: false, reason: "global_daily_cap" };
  }
  return { allowed: true };
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class SpendLedger {
  private repoSpend = new Map<string, number>();
  private globalSpend = new Map<string, number>();

  spent(repoId: string, day: string): { repo: number; global: number } {
    return {
      repo: this.repoSpend.get(`${repoId}|${day}`) ?? 0,
      global: this.globalSpend.get(day) ?? 0,
    };
  }

  tryReserve(input: {
    repoId: string;
    day: string;
    estimateUsd: number;
    repoCapUsd: number;
    globalCapUsd: number;
  }): CapDecision {
    const spent = this.spent(input.repoId, input.day);
    const decision = checkSpendCaps({
      repoSpentUsd: spent.repo,
      globalSpentUsd: spent.global,
      repoCapUsd: input.repoCapUsd,
      globalCapUsd: input.globalCapUsd,
      nextJobEstimateUsd: input.estimateUsd,
    });
    if (!decision.allowed) return decision;
    this.repoSpend.set(
      `${input.repoId}|${input.day}`,
      spent.repo + input.estimateUsd,
    );
    this.globalSpend.set(input.day, spent.global + input.estimateUsd);
    return { allowed: true };
  }
}

export function readCap(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export {
  DEFAULT_REPO_DAILY_CAP_USD,
  DEFAULT_GLOBAL_DAILY_CAP_USD,
  DEFAULT_FIRST_BUILD_CAP_USD,
} from "@/lib/copilot/limits";

export function spendDecision(input: {
  jobKind: "FIRST_BUILD" | "OTHER";
  repoSpentUsd: number;
  firstBuildSpentUsd: number;
  globalSpentUsd: number;
  repoCapUsd: number;
  firstBuildCapUsd: number;
  globalCapUsd: number;
  nextJobEstimateUsd: number;
}): CapDecision {
  return checkSpendCaps({
    repoSpentUsd: input.jobKind === "FIRST_BUILD" ? input.firstBuildSpentUsd : input.repoSpentUsd,
    globalSpentUsd: input.globalSpentUsd,
    repoCapUsd: input.jobKind === "FIRST_BUILD" ? input.firstBuildCapUsd : input.repoCapUsd,
    globalCapUsd: input.globalCapUsd,
    nextJobEstimateUsd: input.nextJobEstimateUsd,
  });
}
