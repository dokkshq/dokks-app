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

/** Matches the pipeline stop line. The daily cap hold must stay under the first-build cap. */
export const PIPELINE_COST_CEILING_USD = 6;

export function reserveTokensForKind(
  kind: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT" | "SUMMARY_REFRESH",
): { prompt: number; completion: number } {
  if (kind === "FIRST_BUILD") return { prompt: 80_000, completion: 40_000 };
  if (kind === "PUSH_UPDATE") return { prompt: 40_000, completion: 16_000 };
  if (kind === "CHAT_EDIT") return { prompt: 24_000, completion: 8_000 };
  return reserveTokens("small");
}

export function holdUsdForKind(
  kind: "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT" | "SUMMARY_REFRESH",
  tokenEstimateUsd: number,
): number {
  if (kind === "SUMMARY_REFRESH") return tokenEstimateUsd;
  if (kind === "FIRST_BUILD") return Math.max(tokenEstimateUsd, PIPELINE_COST_CEILING_USD);
  return Math.min(tokenEstimateUsd, PIPELINE_COST_CEILING_USD);
}
