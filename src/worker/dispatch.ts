import { JobPhase, type Job } from "@/generated/prisma/client";
import {
  DEFAULT_GLOBAL_DAILY_CAP_USD,
  DEFAULT_REPO_DAILY_CAP_USD,
  readCap,
} from "@/lib/copilot/caps";
import { draftFromGeneration, type PageDraft } from "@/lib/copilot/contract";
import {
  DEFAULT_FIRST_BUILD_CAP_USD,
} from "@/lib/copilot/caps";
import {
  estimateCostUsd,
  holdUsdForKind,
  ratesFromEnv,
  reserveTokens,
  reserveTokensForKind,
} from "@/lib/copilot/cost";
import { runAgentLoop, type AgentEvent } from "@/lib/copilot/agent-loop";
import { chooseProductArea, detectProductAreas } from "@/lib/copilot/batches";
import { classifyChatTurn } from "@/lib/copilot/chat-intent";
import { extractFacts } from "@/lib/copilot/facts";
import { generateRepoSummary } from "@/lib/copilot/generate";
import { readStoredPlan } from "@/lib/copilot/plan-gate";
import { runChatPipeline, runFirstBuildPipeline, runPushPipeline } from "@/lib/copilot/pipeline";
import { taskSizeForJob } from "@/lib/copilot/models";
import {
  releaseUsage,
  releaseUsageForJob,
  reserveDailySpend,
  finalizeUsage,
} from "@/lib/copilot/reserve";
import { runWithJobAbort } from "@/lib/copilot/job-abort";
import { resolveProvider } from "@/lib/copilot/providers";
import { assertCredits } from "@/lib/credits/apply";
import { getPrisma } from "@/lib/db";
import { GithubRateLimitError } from "@/lib/github/api-error";
import { createInstallationToken } from "@/lib/github/installation-token";
import {
  listRepoPaths,
  readRepoChange,
  readRepoSnapshot,
} from "@/lib/github/repo-content";
import { applyDrafts } from "@/lib/sites/publish";
import {
  PermanentJobError,
  TransientJobError,
  safeErrorMessage,
} from "@/worker/errors";
import { logJobEvent } from "@/worker/events";
import {
  assertOwnership,
  finishJob,
  heartbeat,
} from "@/worker/queue";
import type { WorkerConfig } from "@/worker/config";

type ProgressReporter = {
  phase: JobPhase;
  progress: number;
  message: string;
  detail?: string | null;
};

export async function runJob(
  jobId: string,
  config: WorkerConfig,
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  const loaded = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      repo: {
        include: {
          installation: true,
          site: true,
        },
      },
      chatEdit: true,
    },
  });
  if (!loaded) throw new PermanentJobError("The job no longer exists.");
  const repo = loaded.repo;
  const site = repo.site;
  if (!site) {
    throw new PermanentJobError("This repository is not connected to a site.");
  }
  if (site.status === "PAUSED") {
    throw new PermanentJobError("This site is paused.");
  }
  const credits = await assertCredits(site.ownerId);
  if (!credits.ok) {
    throw new PermanentJobError(credits.error);
  }
  if (repo.installation.uninstalledAt || repo.installation.suspendedAt) {
    throw new PermanentJobError("The GitHub App is not connected for this repository.");
  }

  const heartbeatTimer = setInterval(() => {
    void heartbeat(jobId, config.workerId, config.leaseMs).catch(() => undefined);
  }, config.heartbeatMs);
  heartbeatTimer.unref?.();
  const abort = new AbortController();
  const watchCancellation = () => {
    void prisma.job
      .findUnique({ where: { id: jobId }, select: { status: true, lockedBy: true } })
      .then((job) => {
        if (!job || job.status !== "RUNNING" || job.lockedBy !== config.workerId) abort.abort();
      })
      .catch(() => undefined);
  };
  watchCancellation();
  const cancelWatch = setInterval(watchCancellation, 1000);
  cancelWatch.unref?.();

  let usageId: string | undefined;
  try {
    await runWithJobAbort(abort.signal, async () => {
    const instruction =
      loaded.kind === "CHAT_EDIT" ? loaded.chatEdit?.instruction ?? "" : undefined;
    const task = taskSizeForJob(loaded.kind, instruction);
    const provider = resolveProvider(task, process.env);
    await prisma.job.updateMany({
      where: { id: jobId, status: "RUNNING", lockedBy: config.workerId },
      data: {
        provider: provider.id === "fake" ? "FAKE" : "XAI",
        model: provider.model,
      },
    });
    const multiStage =
      loaded.kind === "FIRST_BUILD" ||
      loaded.kind === "PUSH_UPDATE" ||
      loaded.kind === "CHAT_EDIT";
    const rates =
      provider.id === "fake"
        ? { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }
        : ratesFromEnv(process.env);
    const reserve = multiStage ? reserveTokensForKind(loaded.kind) : reserveTokens(task);
    const tokenEstimateUsd = estimateCostUsd(reserve, rates);
    const estimateUsd =
      loaded.kind === "FIRST_BUILD" ||
      loaded.kind === "PUSH_UPDATE" ||
      loaded.kind === "CHAT_EDIT" ||
      loaded.kind === "SUMMARY_REFRESH"
        ? holdUsdForKind(loaded.kind, tokenEstimateUsd)
        : tokenEstimateUsd;
    await releaseUsageForJob(jobId);
    const reservation = await reserveDailySpend({
      repoId: repo.id,
      estimateUsd,
      repoCapUsd: readCap(process.env.REPO_DAILY_CAP_USD, DEFAULT_REPO_DAILY_CAP_USD),
      globalCapUsd: readCap(
        process.env.GLOBAL_DAILY_CAP_USD,
        DEFAULT_GLOBAL_DAILY_CAP_USD,
      ),
      firstBuildCapUsd: readCap(process.env.FIRST_BUILD_CAP_USD, DEFAULT_FIRST_BUILD_CAP_USD),
      provider: provider.id === "fake" ? "FAKE" : "XAI",
      model: provider.model,
      jobId,
      jobKind: loaded.kind,
    });
    if (!reservation.allowed) {
      const cap =
        reservation.reason === "global_daily_cap"
          ? readCap(process.env.GLOBAL_DAILY_CAP_USD, DEFAULT_GLOBAL_DAILY_CAP_USD)
          : loaded.kind === "FIRST_BUILD"
            ? readCap(process.env.FIRST_BUILD_CAP_USD, DEFAULT_FIRST_BUILD_CAP_USD)
            : readCap(process.env.REPO_DAILY_CAP_USD, DEFAULT_REPO_DAILY_CAP_USD);
      throw new PermanentJobError(
        `This build needs about $${estimateUsd.toFixed(2)}, which is over today's $${cap.toFixed(2)} spend cap. Try again tomorrow.`,
      );
    }
    usageId = reservation.usageId;

    if (loaded.kind === "SUMMARY_REFRESH") {
      await refreshSummary({
        job: loaded,
        config,
        provider,
        owner: repo.owner,
        name: repo.name,
        branch: repo.defaultBranch,
        installationId: repo.installation.githubInstallationId,
        usageId,
      });
      return;
    }

    if (loaded.kind === "CHAT_EDIT") {
      await runChatEdit({
        job: loaded,
        config,
        provider,
        siteId: site.id,
        siteName: site.name,
        pageId: loaded.chatEdit?.pageId ?? null,
        instruction: instruction ?? "",
        usageId,
      });
      return;
    }

    const token = await installationToken(repo.installation.githubInstallationId);
    if (loaded.kind === "FIRST_BUILD") {
      await runFirstBuild({
        job: loaded,
        config,
        provider,
        token,
        owner: repo.owner,
        name: repo.name,
        branch: repo.defaultBranch,
        siteId: site.id,
        siteName: site.name,
        siteDescription: site.description,
        repoSummary: repo.summary,
        reviewMode: site.reviewMode,
        usageId,
      });
      return;
    }

    if (loaded.kind === "PUSH_UPDATE") {
      await runPushUpdate({
        job: loaded,
        config,
        provider,
        token,
        owner: repo.owner,
        name: repo.name,
        branch: repo.defaultBranch,
        siteId: site.id,
        siteName: site.name,
        repoSummary: repo.summary,
        reviewMode: site.reviewMode,
        usageId,
      });
      return;
    }

    throw new PermanentJobError("This job type is not supported.");
    });
  } catch (error) {
    await releaseUsage(usageId).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
    clearInterval(cancelWatch);
  }
}

async function runFirstBuild(args: {
  job: Job;
  config: WorkerConfig;
  provider: ReturnType<typeof resolveProvider>;
  token: string;
  owner: string;
  name: string;
  branch: string;
  siteId: string;
  siteName: string;
  siteDescription: string | null;
  repoSummary: string | null;
  reviewMode: "AUTO_PUBLISH" | "REVIEW";
  usageId?: string;
}) {
  const stored = readStoredPlan(args.job.payload);
  await progress(args.job.id, args.config, {
    phase: JobPhase.READING_REPO,
    progress: 10,
    message: "Reading the product",
    detail: "Reading the README, then the product source.",
  });
  const index = await repoCall(() =>
    listRepoPaths({
      owner: args.owner,
      name: args.name,
      branch: args.branch,
      token: args.token,
    }),
  );
  const choice = chooseProductArea(detectProductAreas(index.paths), args.siteName, stored?.productRoot);
  const snapshot = await repoCall(() =>
    readRepoSnapshot({
      owner: args.owner,
      name: args.name,
      branch: args.branch,
      token: args.token,
      ref: index.sha,
      productRoot: choice.area.root,
      excludeRoots: choice.area.root === "" ? choice.others.map((area) => area.root).filter(Boolean) : [],
      readAllBatches: true,
    }),
  );
  const facts = extractFacts(snapshot);
  await assertOwnership(args.job.id, args.config.workerId);
  if (stored?.approved && !stored.replan) {
    await progress(args.job.id, args.config, {
      phase: JobPhase.GENERATING,
      progress: 55,
      message: "Writing the docs",
      detail: "Writing the approved outline.",
    });
    const generated = await runFirstBuildPipeline({
      heavy: resolveProvider("heavy", process.env),
      small: resolveProvider("small", process.env),
      siteName: args.siteName,
      repoFullName: `${args.owner}/${args.name}`,
      snapshot,
      facts,
      approvedPlan: stored.pages,
      productRoot: stored.productRoot,
    });
    await finalize(args.usageId, generated.usage);
    if (generated.pages.length === 0) {
      const usage = await jobUsageTotals(args.job.id);
      await logJobEvent({
        jobId: args.job.id,
        message: "No pages were written. The run stopped or review rejected the drafts.",
        phase: JobPhase.COMPLETE,
        progress: 100,
        detail: "Nothing to publish",
        metadata: { role: "reply" },
      });
      await finishJob({
        jobId: args.job.id,
        workerId: args.config.workerId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        successMessage: "No pages were written.",
      });
      return;
    }
    await publish(
      { ...args, reviewMode: "REVIEW" },
      {
        pages: generated.pages.map(draftFromGeneration),
        removedSlugs: generated.removedSlugs,
        changeNote: generated.changeNote ?? args.siteDescription,
        source: "FIRST_BUILD",
        baseSha: snapshot.sha,
      },
    );
    return;
  }
  await progress(args.job.id, args.config, {
    phase: JobPhase.GENERATING,
    progress: 35,
    message: "Planning the outline",
    detail: "No pages are written until you approve the outline.",
  });
  const generated = await runFirstBuildPipeline({
    heavy: resolveProvider("heavy", process.env),
    small: resolveProvider("small", process.env),
    siteName: args.siteName,
    repoFullName: `${args.owner}/${args.name}`,
    snapshot,
    facts,
    productRoot: choice.area.root,
  });
  await parkForPlan({
    job: args.job,
    config: args.config,
    usageId: args.usageId,
    usage: generated.usage,
    plan: generated.plan,
    coverage: generated.coverageNote,
    productRoot: choice.area.root,
    products: [choice.area, ...choice.others],
  });
}

async function runPushUpdate(args: {
  job: Job;
  config: WorkerConfig;
  provider: ReturnType<typeof resolveProvider>;
  token: string;
  owner: string;
  name: string;
  branch: string;
  siteId: string;
  siteName: string;
  repoSummary: string | null;
  reviewMode: "AUTO_PUBLISH" | "REVIEW";
  usageId?: string;
}) {
  await progress(args.job.id, args.config, {
    phase: JobPhase.READING_REPO,
    progress: 10,
    message: "Reading changes",
    detail: "Comparing the pushed commit with the previous commit",
  });
  const payload = (args.job.payload ?? {}) as {
    before?: unknown;
    after?: unknown;
  };
  const before = typeof payload.before === "string" ? payload.before : "";
  const after = typeof payload.after === "string" ? payload.after : "";
  if (!/^[0-9a-f]{7,40}$/i.test(after)) {
    throw new PermanentJobError("The push event is missing its commit.");
  }
  const change = await repoCall(() =>
    readRepoChange({
      owner: args.owner,
      name: args.name,
      branch: args.branch,
      before: /^[0-9a-f]{7,40}$/i.test(before) ? before : "",
      after,
      token: args.token,
    }),
  );
  if (
    change.changedPaths.length === 0 &&
    change.patches.length === 0 &&
    change.files.length === 0
  ) {
    await releaseUsage(args.usageId);
    await logJobEvent({
      jobId: args.job.id,
      phase: JobPhase.COMPLETE,
      progress: 100,
      detail: "No documentation changes needed",
      message: "No documentation changes needed",
    });
    await finishJob({
      jobId: args.job.id,
      workerId: args.config.workerId,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      successMessage: "No documentation changes needed",
    });
    return;
  }
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  const existing = await prisma.page.findMany({
    where: { siteId: args.siteId, published: true },
    select: {
      slug: true,
      section: true,
      title: true,
      description: true,
      content: true,
      navOrder: true,
      handEdited: true,
    },
    orderBy: { navOrder: "asc" },
  });
  const snapshot = await repoCall(() =>
    readRepoSnapshot({
      owner: args.owner,
      name: args.name,
      branch: args.branch,
      token: args.token,
      ref: after,
    }),
  );
  const facts = extractFacts(snapshot);
  await progress(args.job.id, args.config, {
    phase: JobPhase.GENERATING,
    progress: 35,
    message: "Updating pages",
    detail: `Reviewing ${change.changedPaths.length} changed files`,
  });
  const generated = await runPushPipeline({
    heavy: resolveProvider("heavy", process.env),
    small: resolveProvider("small", process.env),
    siteName: args.siteName,
    repoFullName: `${args.owner}/${args.name}`,
    facts,
    files: snapshot.files,
    treePaths: snapshot.treePaths,
    changedPaths: change.changedPaths,
    removedPaths: change.removedPaths,
    existingPages: existing.filter((page) => !page.handEdited),
  });
  await finalize(args.usageId, generated.usage);
  if (generated.pages.length === 0 && generated.removedSlugs.length === 0) {
    const usage = await jobUsageTotals(args.job.id);
    await logJobEvent({
      jobId: args.job.id,
      phase: JobPhase.COMPLETE,
      progress: 100,
      detail: "No documentation changes needed",
      message: "No documentation changes needed",
    });
    await finishJob({
      jobId: args.job.id,
      workerId: args.config.workerId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      successMessage: "No documentation changes needed",
    });
    return;
  }
  await publish(
    { ...args, reviewMode: "REVIEW" },
    {
      pages: generated.pages.map(draftFromGeneration),
      removedSlugs: generated.removedSlugs,
      changeNote: generated.changeNote ?? args.repoSummary,
      source: "PUSH_UPDATE",
      baseSha: after,
    },
  );
}

async function runChatEdit(args: {
  job: Job;
  config: WorkerConfig;
  provider: ReturnType<typeof resolveProvider>;
  siteId: string;
  siteName: string;
  pageId: string | null;
  instruction: string;
  usageId?: string;
}) {
  if (!args.instruction.trim()) {
    throw new PermanentJobError("The chat instruction was empty.");
  }
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  const pages = await prisma.page.findMany({
    where: { siteId: args.siteId },
    select: {
      id: true,
      slug: true,
      section: true,
      title: true,
      description: true,
      content: true,
      navOrder: true,
    },
    orderBy: { navOrder: "asc" },
  });
  const focus = args.pageId ? pages.find((page) => page.id === args.pageId) : null;
  if (args.pageId && !focus) throw new PermanentJobError("That page no longer exists.");
  const repo = await prisma.repo.findUnique({
    where: { id: args.job.repoId },
    include: { installation: true },
  });
  let facts = null;
  let files: Awaited<ReturnType<typeof readRepoSnapshot>>["files"] = [];
  let treePaths: string[] = [];
  if (repo && !repo.installation.uninstalledAt && !repo.installation.suspendedAt) {
    try {
      const token = await installationToken(repo.installation.githubInstallationId);
      const snapshot = await readRepoSnapshot({
        owner: repo.owner,
        name: repo.name,
        branch: repo.defaultBranch,
        token,
      });
      facts = extractFacts(snapshot);
      files = snapshot.files;
      treePaths = snapshot.treePaths;
    } catch (error) {
      const message = safeErrorMessage(error);
      if (!/\b(401|403|404)\b/.test(message)) throw new TransientJobError(message);
    }
  }
  const drafts = pages.map((page) => ({
    slug: page.slug,
    section: page.section,
    title: page.title,
    description: page.description,
    navOrder: page.navOrder,
    content: page.content,
  }));
  const intent = classifyChatTurn(args.instruction);
  const storedPlan = readStoredPlan(args.job.payload);
  if (intent !== "question") {
    if (!storedPlan?.approved) {
      const planned = await runChatPipeline({
        heavy: resolveProvider("heavy", process.env),
        small: resolveProvider("small", process.env),
        siteName: args.siteName,
        repoFullName: repo ? repo.fullName : null,
        facts,
        files,
        treePaths,
        focusSlug: focus?.slug ?? null,
        instruction: args.instruction,
        pages: drafts,
      });
      await parkForPlan({
        job: args.job,
        config: args.config,
        usageId: args.usageId,
        usage: planned.usage,
        plan: planned.plan,
        coverage: "Approve the pages to change before anything is written.",
        productRoot: "",
        products: [],
      });
      return;
    }
  }
  const agent = intent === "question"
    ? await runAgentLoop({
        model: resolveProvider("heavy", process.env),
        goal: withPriorWork(args.instruction, await priorWork(args.job.id)),
        siteName: args.siteName,
        files,
        treePaths,
        pages: drafts,
        maxSteps: 16,
        planApproved: false,
        onEvent: (event) => logAgentEvent(args.job.id, event),
      }).catch(() => null)
    : null;
  const changed = false;
  if (intent === "question" && agent?.finished && !changed) {
    await finalize(args.usageId, agent);
    const usage = await jobUsageTotals(args.job.id);
    await logJobEvent({
      jobId: args.job.id,
      message: agent.reply,
      phase: JobPhase.COMPLETE,
      progress: 100,
      detail: "Answered",
      metadata: { role: "reply" },
    });
    await finishJob({
      jobId: args.job.id,
      workerId: args.config.workerId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      successMessage: "Answered",
    });
    return;
  }
  const generated = agent && changed
    ? {
        pages: agent.pages.filter((page) => {
          const prior = drafts.find((item) => item.slug === page.slug);
          return !prior || prior.content !== page.content || prior.title !== page.title;
        }),
        removedSlugs: [] as string[],
        changeNote: agent.reply,
        usage: agent,
      }
    : await runChatPipeline({
    heavy: resolveProvider("heavy", process.env),
    small: resolveProvider("small", process.env),
    siteName: args.siteName,
    repoFullName: repo ? repo.fullName : null,
    facts,
    files,
    treePaths,
    focusSlug: focus?.slug ?? null,
    instruction: args.instruction,
    approvedPlan: storedPlan?.approved ? storedPlan.pages : null,
    pages: pages.map((page) => ({
      slug: page.slug,
      section: page.section,
      title: page.title,
      description: page.description,
      navOrder: page.navOrder,
      content: page.content,
    })),
  });
  await finalize(args.usageId, generated.usage);
  if (generated.pages.length === 0) {
    throw new PermanentJobError("The edit did not return any pages.");
  }
  const usage = await jobUsageTotals(args.job.id);
  if (!(agent && changed)) {
    await progress(args.job.id, args.config, {
      phase: JobPhase.PUBLISHING,
      progress: 80,
      message: "Preparing your edit",
      detail: "This edit will wait for your approval",
    });
  }
  const site = await prisma.site.findUnique({
    where: { id: args.siteId },
    select: { reviewMode: true },
  });
  if (!site) throw new PermanentJobError("The site no longer exists.");
  await assertOwnership(args.job.id, args.config.workerId);
  const applied = await applyDrafts({
    siteId: args.siteId,
    jobId: args.job.id,
    source: "CHAT_EDIT",
    reviewMode: site.reviewMode,
    baseSha: null,
    pages: generated.pages.map(draftFromGeneration),
    removedSlugs: generated.removedSlugs,
    changeNote: generated.changeNote,
  });
  const message =
    agent && changed && agent.reply
      ? agent.reply
      : applied.pending > 0
        ? "Your edit is ready for review."
        : "The edit did not change the page.";
  await logJobEvent({
    jobId: args.job.id,
    level: "info",
    message,
    phase: JobPhase.COMPLETE,
    progress: 100,
    detail: message,
    metadata: { role: "reply" },
  });
  await finishJob({
    jobId: args.job.id,
    workerId: args.config.workerId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    successMessage: message,
  });
}

async function refreshSummary(args: {
  job: Job;
  config: WorkerConfig;
  provider: ReturnType<typeof resolveProvider>;
  owner: string;
  name: string;
  branch: string;
  installationId: string;
  usageId?: string;
}) {
  const token = await installationToken(args.installationId);
  await progress(args.job.id, args.config, {
    phase: JobPhase.READING_REPO,
    progress: 10,
    message: "Reading repository",
    detail: "Finding the parts that describe the project",
  });
  const snapshot = await repoCall(() =>
    readRepoSnapshot({
      owner: args.owner,
      name: args.name,
      branch: args.branch,
      token,
    }),
  );
  await progress(args.job.id, args.config, {
    phase: JobPhase.GENERATING,
    progress: 40,
    message: "Refreshing the summary",
    detail: "Summarizing the repository",
  });
  const generated = await generateRepoSummary({
    provider: args.provider,
    siteName: args.name,
    snapshot,
  });
  await finalize(args.usageId, generated.completion);
  const usage = await jobUsageTotals(args.job.id);
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  await assertOwnership(args.job.id, args.config.workerId);
  await prisma.repo.update({
    where: { id: args.job.repoId },
    data: {
      summary: generated.text,
      summarySha: snapshot.sha,
      summaryCachedAt: new Date(),
    },
  });
  await logJobEvent({
    jobId: args.job.id,
    message: "Summary refreshed",
    phase: JobPhase.COMPLETE,
    progress: 100,
    detail: "Summary refreshed",
  });
  await finishJob({
    jobId: args.job.id,
    workerId: args.config.workerId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    successMessage: "Summary refreshed",
  });
}

async function parkForPlan(args: {
  job: Job;
  config: WorkerConfig;
  usageId?: string;
  usage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number };
  plan: import("@/lib/copilot/page-plan").PlannedPage[];
  coverage: string | null;
  productRoot: string;
  products: import("@/lib/copilot/batches").ProductArea[];
}) {
  await finalize(args.usageId, args.usage);
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to run the worker.");
  const current = await prisma.job.findUnique({
    where: { id: args.job.id },
    select: { payload: true },
  });
  const previous =
    current?.payload && typeof current.payload === "object" && !Array.isArray(current.payload)
      ? current.payload
      : {};
  await prisma.job.updateMany({
    where: { id: args.job.id, status: "RUNNING", lockedBy: args.config.workerId },
    data: {
      status: "WAITING",
      phase: "AWAITING_APPROVAL",
      progress: 45,
      detail: "Waiting for you to approve the outline",
      payload: {
        ...previous,
        docsPlan: {
          approved: false,
          replan: false,
          productRoot: args.productRoot,
          products: args.products,
          coverage: args.coverage ?? "",
          pages: args.plan,
        },
      },
      lockedBy: null,
      leaseUntil: null,
      maxAttempts: 8,
    },
  });
  await logJobEvent({
    jobId: args.job.id,
    message: args.coverage || "Outline is ready. Add, drop, rename, or merge pages, then approve it.",
    phase: JobPhase.AWAITING_APPROVAL,
    progress: 45,
    detail: "Waiting for plan approval",
    metadata: { role: "say" },
  });
}

async function publish(
  args: {
    job: Job;
    config: WorkerConfig;
    siteId: string;
    reviewMode: "AUTO_PUBLISH" | "REVIEW";
  },
  input: {
    pages: PageDraft[];
    removedSlugs: string[];
    changeNote: string | null;
    source: "FIRST_BUILD" | "PUSH_UPDATE";
    baseSha: string | null;
  },
  reply?: string,
) {
  const usage = await jobUsageTotals(args.job.id);
  await progress(args.job.id, args.config, {
    phase: JobPhase.VALIDATING,
    progress: 65,
    message: "Checking pages",
    detail: `Checking ${input.pages.length} pages`,
  });
  await assertOwnership(args.job.id, args.config.workerId);
  await progress(args.job.id, args.config, {
    phase: JobPhase.PUBLISHING,
    progress: 85,
    message: args.reviewMode === "AUTO_PUBLISH" ? "Updating your docs" : "Preparing your review",
    detail:
      args.reviewMode === "AUTO_PUBLISH"
        ? "Making the changes live"
        : "The changes will wait for your approval",
  });
  const applied = await applyDrafts({
    siteId: args.siteId,
    jobId: args.job.id,
    source: input.source,
    reviewMode: args.reviewMode,
    baseSha: input.baseSha,
    pages: input.pages,
    removedSlugs: input.removedSlugs,
    changeNote: input.changeNote,
  }).catch((error) => {
    const message = safeErrorMessage(error);
    if (/^(Site not found\.|This site is paused\.)$/.test(message)) {
      throw new PermanentJobError(message);
    }
    throw error;
  });
  const message =
    reply ||
    (args.reviewMode === "REVIEW" && applied.pending > 0
      ? "Changes are ready for review."
      : applied.published > 0
        ? `Published ${applied.published} page${applied.published === 1 ? "" : "s"}.`
        : applied.skipped > 0
          ? "No pages changed. Hand edited pages were skipped."
          : "No pages changed.");
  await logJobEvent({
    jobId: args.job.id,
    message,
    phase: JobPhase.COMPLETE,
    progress: 100,
    detail: message,
    metadata: {
      role: "reply",
      published: applied.published,
      pending: applied.pending,
      skipped: applied.skipped,
      removed: applied.removed,
    },
  });
  await finishJob({
    jobId: args.job.id,
    workerId: args.config.workerId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    successMessage: message,
  });
}

async function jobUsageTotals(jobId: string): Promise<{
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
}> {
  const prisma = getPrisma();
  if (!prisma) {
    return { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 };
  }
  const rows = await prisma.usageEntry.findMany({
    where: { jobId, status: "FINAL" },
    select: {
      promptTokens: true,
      completionTokens: true,
      estimatedCostUsd: true,
    },
  });
  return rows.reduce(
    (total, row) => ({
      promptTokens: total.promptTokens + row.promptTokens,
      completionTokens: total.completionTokens + row.completionTokens,
      estimatedCostUsd: total.estimatedCostUsd + Number(row.estimatedCostUsd),
    }),
    { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
  );
}

async function finalize(
  usageId: string | undefined,
  result: { promptTokens: number; completionTokens: number; estimatedCostUsd: number },
): Promise<void> {
  if (!usageId) return;
  await finalizeUsage({
    usageId,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    estimatedCostUsd: result.estimatedCostUsd,
  });
}

async function priorWork(jobId: string): Promise<string> {
  const prisma = getPrisma();
  if (!prisma) return "";
  const events = await prisma.jobEvent.findMany({
    where: { jobId },
    orderBy: { sequence: "asc" },
    take: 40,
    select: { message: true },
  });
  return events.map((event) => event.message).filter(Boolean).join("\n");
}

function withPriorWork(goal: string, prior: string): string {
  if (!prior.trim()) return goal;
  return `${goal}\n\nYou already did this work. Continue from here. Do not repeat finished steps.\n${prior}`;
}

async function logAgentEvent(jobId: string, event: AgentEvent): Promise<void> {
  await logJobEvent({
    jobId,
    message: event.message,
    metadata: {
      role: event.role,
      body: event.body,
      explored: event.explored,
      searches: event.searches,
      edited: event.edited,
    },
  });
}

async function progress(
  jobId: string,
  config: WorkerConfig,
  input: ProgressReporter,
): Promise<void> {
  await logJobEvent({
    jobId,
    message: input.message,
    phase: input.phase,
    progress: input.progress,
    detail: input.detail,
    metadata: { role: "thought", body: input.detail },
  });
  await assertOwnership(jobId, config.workerId);
}

async function installationToken(installationId: string): Promise<string> {
  const result = await createInstallationToken({ installationId });
  return result.token;
}

async function repoCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const message = safeErrorMessage(error);
    if (error instanceof GithubRateLimitError) {
      throw new TransientJobError(message);
    }
    if (/\b(401|403|404)\b/.test(message)) {
      throw new PermanentJobError(message);
    }
    throw new TransientJobError(message);
  }
}
