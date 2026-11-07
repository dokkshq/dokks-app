export type RateCard = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export const DEFAULT_XAI_RATES: RateCard = {
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
};

export function readRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function ratesFromEnv(env: Record<string, string | undefined>): RateCard {
  return {
    inputUsdPerMillion: readRate(
      env.XAI_INPUT_USD_PER_MTOK,
      DEFAULT_XAI_RATES.inputUsdPerMillion,
    ),
    outputUsdPerMillion: readRate(
      env.XAI_OUTPUT_USD_PER_MTOK,
      DEFAULT_XAI_RATES.outputUsdPerMillion,
    ),
  };
}

export function estimateCostUsd(
  tokens: { prompt: number; completion: number },
  rates: RateCard,
): number {
  const cost =
    (tokens.prompt * rates.inputUsdPerMillion +
      tokens.completion * rates.outputUsdPerMillion) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function reserveTokens(task: "heavy" | "small"): {
  prompt: number;
  completion: number;
} {
  if (task === "heavy") return { prompt: 20_000, completion: 8_000 };
  return { prompt: 4_000, completion: 1_500 };
}

import { PIPELINE_COST_CEILING_USD } from "@/lib/copilot/limits";

/** Matches the pipeline stop line. The daily cap hold must stay under the first-build cap. */
export { PIPELINE_COST_CEILING_USD };

export function reserveTokensForKind(
  kind: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT" | "SUMMARY_REFRESH",
): { prompt: number; completion: number } {
  if (kind === "FIRST_BUILD") return { prompt: 80_000, completion: 40_000 };
  if (kind === "PUSH_UPDATE") return { prompt: 40_000, completion: 16_000 };
  if (kind === "CHAT_EDIT") return { prompt: 24_000, completion: 8_000 };
  return reserveTokens("small");
}

/** Finalized job spend the next pipeline invocation must count toward the $6 ceiling. */
export function carryFinalizedSpend(finalizedUsd: number): number {
  if (!Number.isFinite(finalizedUsd) || finalizedUsd <= 0) return 0;
  return roundUsd(finalizedUsd);
}

/**
 * Usage stored on this invocation. The pipeline total includes carried spend so the
 * ceiling can see it; the ledger row must stay incremental or the daily cap counts it twice.
 */
export function usageAfterCarry(
  usage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number },
  carriedUsd: number,
): { promptTokens: number; completionTokens: number; estimatedCostUsd: number } {
  return {
    promptTokens: Math.max(0, Math.trunc(usage.promptTokens)),
    completionTokens: Math.max(0, Math.trunc(usage.completionTokens)),
    estimatedCostUsd: roundUsd(Math.max(0, usage.estimatedCostUsd - Math.max(0, carriedUsd))),
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function holdUsdForKind(
  kind: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT" | "SUMMARY_REFRESH",
  tokenEstimateUsd: number,
): number {
  if (kind === "SUMMARY_REFRESH") return tokenEstimateUsd;
  if (kind === "FIRST_BUILD") return Math.max(tokenEstimateUsd, PIPELINE_COST_CEILING_USD);
  return Math.min(tokenEstimateUsd, PIPELINE_COST_CEILING_USD);
}
