import { describe, expect, it, vi } from "vitest";
import {
  checkSpendCaps,
  spendDecision,
  SpendLedger,
  utcDayKey,
} from "@/lib/copilot/caps";
import { DEFAULT_XAI_RATES, estimateCostUsd, ratesFromEnv, reserveTokens } from "@/lib/copilot/cost";
import { prepareCopilotJob } from "@/lib/copilot/jobs";
import { pageWriteMode, selectModel, taskSizeForJob } from "@/lib/copilot/models";
import { createFakeProvider } from "@/lib/copilot/providers";

describe("spend caps", () => {
  it("allows a job that stays inside both caps and blocks the next one", () => {
    const ledger = new SpendLedger();
    const day = utcDayKey(new Date("2026-10-23T12:00:00Z"));
    const first = ledger.tryReserve({
      repoId: "repo-a",
      day,
      estimateUsd: 1.25,
      repoCapUsd: 2,
      globalCapUsd: 3,
    });
    const second = ledger.tryReserve({
      repoId: "repo-a",
      day,
      estimateUsd: 1,
      repoCapUsd: 2,
      globalCapUsd: 3,
    });
    expect(first).toEqual({ allowed: true });
    expect(second).toEqual({ allowed: false, reason: "repo_daily_cap" });
    expect(ledger.spent("repo-a", day)).toEqual({ repo: 1.25, global: 1.25 });
  });

  it("applies the global cap across repos and resets on the next day", () => {
    const ledger = new SpendLedger();
    const today = "2026-10-23";
    const tomorrow = "2026-10-24";
    expect(
      ledger.tryReserve({
        repoId: "repo-a",
        day: today,
        estimateUsd: 2,
        repoCapUsd: 5,
        globalCapUsd: 3,
      }).allowed,
    ).toBe(true);
    const blocked = ledger.tryReserve({
      repoId: "repo-b",
      day: today,
      estimateUsd: 1.5,
      repoCapUsd: 5,
      globalCapUsd: 3,
    });
    expect(blocked).toEqual({ allowed: false, reason: "global_daily_cap" });
    expect(
      ledger.tryReserve({
        repoId: "repo-b",
        day: tomorrow,
        estimateUsd: 1.5,
        repoCapUsd: 5,
        globalCapUsd: 3,
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects an estimate that would pass either cap by itself", () => {
    expect(
      checkSpendCaps({
        repoSpentUsd: 0,
        globalSpentUsd: 0,
        repoCapUsd: 2,
        globalCapUsd: 25,
        nextJobEstimateUsd: 2,
      }),
    ).toEqual({ allowed: true });
    expect(
      checkSpendCaps({
        repoSpentUsd: 1.5,
        globalSpentUsd: 1.5,
        repoCapUsd: 2,
        globalCapUsd: 25,
        nextJobEstimateUsd: 0.6,
      }).allowed,
    ).toBe(false);
  });

  it("does not call the provider when the cap blocks the job", async () => {
    const provider = createFakeProvider("small", "openai/gpt-oss-120b");
    const complete = vi.spyOn(provider, "complete");
    const ledger = new SpendLedger();
    ledger.tryReserve({
      repoId: "repo-a",
      day: "2026-10-23",
      estimateUsd: 2,
      repoCapUsd: 2,
      globalCapUsd: 25,
    });
    const prepared = await prepareCopilotJob({
      task: "small",
      repoId: "repo-a",
      day: "2026-10-23",
      ledger,
      provider,
      env: { NODE_ENV: "test", REPO_DAILY_CAP_USD: "2", GLOBAL_DAILY_CAP_USD: "25" },
    });
    expect(prepared).toEqual({ ok: false, reason: "repo_daily_cap" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("reserves the heavy-model estimate before a first build", async () => {
    const ledger = new SpendLedger();
    const prepared = await prepareCopilotJob({
      task: "heavy",
      repoId: "repo-a",
      day: "2026-10-23",
      ledger,
      provider: createFakeProvider("heavy", "grok-build-0.1"),
      env: {
        NODE_ENV: "test",
        REPO_DAILY_CAP_USD: "2",
        GLOBAL_DAILY_CAP_USD: "25",
      },
    });
    const estimate = estimateCostUsd(reserveTokens("heavy"), DEFAULT_XAI_RATES);
    expect(prepared).toMatchObject({ ok: true, estimateUsd: estimate });
    expect(ledger.spent("repo-a", "2026-10-23").repo).toBe(estimate);
    expect(estimate).toBeGreaterThan(0);
  });
});

describe("first build allowance", () => {
  it("lets a first build use its own cap after the repo cap is full", () => {
    expect(
      spendDecision({
        jobKind: "FIRST_BUILD",
        repoSpentUsd: 2,
        firstBuildSpentUsd: 0,
        globalSpentUsd: 2,
        repoCapUsd: 2,
        firstBuildCapUsd: 2,
        globalCapUsd: 25,
        nextJobEstimateUsd: 1.2,
      }),
    ).toEqual({ allowed: true });
    expect(
      spendDecision({
        jobKind: "OTHER",
        repoSpentUsd: 2,
        firstBuildSpentUsd: 1.2,
        globalSpentUsd: 3.2,
        repoCapUsd: 2,
        firstBuildCapUsd: 2,
        globalCapUsd: 25,
        nextJobEstimateUsd: 0.1,
      }),
    ).toEqual({ allowed: false, reason: "repo_daily_cap" });
  });
});

describe("xAI rate defaults", () => {
  it("uses $1 input and $2 output per million tokens when the env is unset", () => {
    expect(DEFAULT_XAI_RATES).toEqual({
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    });
    expect(ratesFromEnv({})).toEqual(DEFAULT_XAI_RATES);
  });
});

describe("model routing", () => {
  it("uses grok-build-0.1 for heavy and small jobs", () => {
    expect(selectModel("heavy").model).toBe("grok-build-0.1");
    expect(selectModel("heavy").provider).toBe("xai");
    expect(selectModel("small").model).toBe("grok-build-0.1");
    expect(selectModel("small").provider).toBe("xai");
    expect(selectModel("heavy", { XAI_HEAVY_MODEL: "grok-4.7" }).model).toBe(
      "grok-4.7",
    );
    expect(taskSizeForJob("FIRST_BUILD")).toBe("heavy");
    expect(taskSizeForJob("PUSH_UPDATE")).toBe("small");
    expect(taskSizeForJob("CHAT_EDIT", "short")).toBe("small");
    expect(taskSizeForJob("CHAT_EDIT", "x".repeat(2001))).toBe("heavy");
  });

  it("skips pages a customer edited by hand", () => {
    expect(pageWriteMode({ handEdited: true })).toBe("skip");
    expect(pageWriteMode({ handEdited: false })).toBe("update");
  });
});
