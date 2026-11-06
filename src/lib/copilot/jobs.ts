import {
  DEFAULT_GLOBAL_DAILY_CAP_USD,
  DEFAULT_REPO_DAILY_CAP_USD,
  readCap,
  type CapReason,
  type SpendLedger,
} from "@/lib/copilot/caps";
import { estimateCostUsd, ratesFromEnv, reserveTokens } from "@/lib/copilot/cost";
import { type TaskSize } from "@/lib/copilot/models";
import {
  resolveProvider,
  type CompletionRequest,
  type CompletionResult,
  type CopilotProvider,
} from "@/lib/copilot/providers";

export type PreparedJob =
  | {
      ok: true;
      provider: CopilotProvider;
      model: string;
      estimateUsd: number;
    }
  | { ok: false; reason: CapReason };

export async function prepareCopilotJob(args: {
  task: TaskSize;
  repoId: string;
  day: string;
  ledger: Pick<SpendLedger, "tryReserve">;
  env?: Record<string, string | undefined>;
  provider?: CopilotProvider;
}): Promise<PreparedJob> {
  const env = args.env ?? process.env;
  const provider = args.provider ?? resolveProvider(args.task, env);
  const rates = ratesFromEnv(env);
  const estimateUsd = estimateCostUsd(reserveTokens(args.task), rates);
  const decision = args.ledger.tryReserve({
    repoId: args.repoId,
    day: args.day,
    estimateUsd,
    repoCapUsd: readCap(env.REPO_DAILY_CAP_USD, DEFAULT_REPO_DAILY_CAP_USD),
    globalCapUsd: readCap(env.GLOBAL_DAILY_CAP_USD, DEFAULT_GLOBAL_DAILY_CAP_USD),
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };
  return { ok: true, provider, model: provider.model, estimateUsd };
}

export async function runCopilotJob(args: {
  task: TaskSize;
  repoId: string;
  day: string;
  ledger: Pick<SpendLedger, "tryReserve">;
  request: CompletionRequest;
  repoSummary?: string;
  env?: Record<string, string | undefined>;
  provider?: CopilotProvider;
}): Promise<
  | { ok: true; result: CompletionResult; estimateUsd: number }
  | { ok: false; reason: CapReason }
> {
  const prepared = await prepareCopilotJob(args);
  if (!prepared.ok) return prepared;
  const user = args.repoSummary
    ? `Repository summary:\n${args.repoSummary}\n\n${args.request.user}`
    : args.request.user;
  const result = await prepared.provider.complete({
    system: args.request.system,
    user,
  });
  return { ok: true, result, estimateUsd: prepared.estimateUsd };
}
