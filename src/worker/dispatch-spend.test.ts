import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pipelineCalls: [] as Array<{ alreadySpentUsd?: number }>,
  finalized: [] as Array<{ estimatedCostUsd: number }>,
  usageRows: [] as Array<{
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
    status: "FINAL";
  }>,
  jobUpdates: [] as Array<Record<string, unknown>>,
  payload: {} as unknown,
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({
    job: {
      findUnique: async () => ({
        id: "job_1",
        kind: "FIRST_BUILD",
        status: "RUNNING",
        lockedBy: "worker-test",
        payload: state.payload,
        chatEdit: null,
        repo: {
          id: "repo_1",
          owner: "ada",
          name: "plugr",
          defaultBranch: "main",
          installation: {
            githubInstallationId: "1",
            uninstalledAt: null,
            suspendedAt: null,
          },
          site: {
            id: "site_1",
            ownerId: "user_1",
            name: "Plugr",
            description: null,
            status: "ACTIVE",
            reviewMode: "REVIEW",
          },
        },
      }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        state.jobUpdates.push(data);
        return { count: 1 };
      },
      update: async () => ({ id: "job_1" }),
    },
    usageEntry: {
      findMany: async () => state.usageRows.filter((row) => row.status === "FINAL"),
    },
    $transaction: async (run: (tx: {
      jobEvent: { findFirst: () => Promise<null>; create: () => Promise<{ id: string }> };
      job: { update: () => Promise<{ id: string }> };
    }) => Promise<unknown>) =>
      run({
        jobEvent: {
          findFirst: async () => null,
          create: async () => ({ id: "event_1" }),
        },
        job: {
          update: async () => ({ id: "job_1" }),
        },
      }),
  }),
}));

vi.mock("@/lib/credits/apply", () => ({
  assertCredits: async () => ({ ok: true as const }),
}));

vi.mock("@/lib/copilot/reserve", () => ({
  releaseUsage: async () => undefined,
  releaseUsageForJob: async () => undefined,
  reserveDailySpend: async () => ({ allowed: true as const, usageId: "usage_new" }),
  finalizeUsage: async (input: {
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  }) => {
    state.finalized.push({ estimatedCostUsd: input.estimatedCostUsd });
    state.usageRows.push({
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      status: "FINAL",
    });
  },
}));

vi.mock("@/lib/github/installation-token", () => ({
  createInstallationToken: async () => ({ token: "token", expiresAt: "2099-01-01T00:00:00.000Z" }),
}));

vi.mock("@/lib/github/repo-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/repo-content")>();
  return {
    ...actual,
    listRepoPaths: async () => ({
      sha: "a".repeat(40),
      branch: "main",
      paths: ["README.md", "package.json"],
      treeTruncated: false,
    }),
    readRepoSnapshot: async () => ({
      sha: "a".repeat(40),
      branch: "main",
      treePaths: ["README.md", "package.json"],
      omittedFiles: 0,
      treeTruncated: false,
      files: [
        { path: "README.md", truncated: false, content: "# Plugr\n\nStudents find gigs.\n" },
        { path: "package.json", truncated: false, content: JSON.stringify({ name: "plugr" }) },
      ],
    }),
  };
});

vi.mock("@/lib/copilot/pipeline", () => ({
  runFirstBuildPipeline: async (args: { alreadySpentUsd?: number }) => {
    state.pipelineCalls.push({ alreadySpentUsd: args.alreadySpentUsd });
    const carried = args.alreadySpentUsd ?? 0;
    return {
      pages: [],
      removedSlugs: [],
      changeNote: null,
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        estimatedCostUsd: carried + 1.5,
        stages: [],
      },
      verification: [],
      awaitingApproval: false,
      plan: [],
      coverageNote: null,
    };
  },
  runPushPipeline: async () => {
    throw new Error("push pipeline should not run");
  },
  runChatPipeline: async () => {
    throw new Error("chat pipeline should not run");
  },
}));

vi.mock("@/lib/sites/publish", () => ({
  applyDrafts: async () => {
    throw new Error("publish should not run when no pages were written");
  },
}));

import { runJob } from "@/worker/dispatch";

const config = {
  workerId: "worker-test",
  concurrency: 1,
  maxConcurrentHeavy: 1,
  pollMs: 1_000,
  leaseMs: 30_000,
  heartbeatMs: 60_000,
  reaperMs: 60_000,
};

describe("first-build spend carry", () => {
  beforeEach(() => {
    state.pipelineCalls.length = 0;
    state.finalized.length = 0;
    state.jobUpdates.length = 0;
    state.usageRows.length = 0;
    state.usageRows.push({
      promptTokens: 80,
      completionTokens: 40,
      estimatedCostUsd: 4.25,
      status: "FINAL",
    });
  });

  it("starts the approved write from finalized planning spend", async () => {
    state.payload = {
      docsPlan: {
        approved: true,
        replan: false,
        productRoot: "",
        products: [],
        coverage: "",
        pages: [{ slug: "billing", title: "Billing", section: "Reference" }],
      },
    };
    await runJob("job_1", config);
    expect(state.pipelineCalls.map((call) => call.alreadySpentUsd)).toEqual([4.25]);
    expect(state.finalized.map((row) => row.estimatedCostUsd)).toEqual([1.5]);
    const finished = state.jobUpdates.find((data) => data.status === "SUCCEEDED");
    expect(finished?.estimatedCostUsd).toBe(5.75);
  });

  it("counts earlier planning spend when planning runs again", async () => {
    state.payload = {};
    await runJob("job_1", config);
    expect(state.pipelineCalls.map((call) => call.alreadySpentUsd)).toEqual([4.25]);
    expect(state.finalized.map((row) => row.estimatedCostUsd)).toEqual([1.5]);
    expect(state.jobUpdates.some((data) => data.status === "WAITING")).toBe(true);
  });
});
