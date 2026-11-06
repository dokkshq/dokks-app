import { PIPELINE_COST_CEILING_USD } from "@/lib/copilot/cost";
import { parseModelJson, type PageDraft } from "@/lib/copilot/contract";
import { factsDigest, type RepoFacts } from "@/lib/copilot/facts";
import {
  factualPageContent,
  mergePagePlan,
  pagesAffectedByChange,
  planPagesFromFacts,
  productCritique,
  readSourcePaths,
  withSources,
  type PlannedPage,
} from "@/lib/copilot/page-plan";
import { buildProductModel, mergeProductModel, type ProductJob, type ProductModel, type ProductNoun } from "@/lib/copilot/product-model";
import { extractProductSurface } from "@/lib/copilot/product-surface";
import {
  chatPlanRequest,
  modelRequest,
  pageCritiqueRequest,
  pageRewriteRequest,
  pageWriteRequest,
  planRequest,
} from "@/lib/copilot/prompts";
import type { CompletionResult, CopilotProvider } from "@/lib/copilot/providers";
import { repairSiteLinks, verifyPage, type Violation } from "@/lib/copilot/verify";
import type { RepoFile, RepoSnapshot } from "@/lib/github/repo-content";

const PAGE_CONCURRENCY = 4;
const COST_CEILING_USD = PIPELINE_COST_CEILING_USD;
const SOURCE_BUDGET = 14_000;

export type StageUsage = {
  stage: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
};

export type PipelineUsage = {
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  stages: StageUsage[];
};

export type PageVerification = {
  slug: string;
  violations: Violation[];
  rewritten: boolean;
  stubbed: boolean;
};

export type PipelineResult = {
  pages: PageDraft[];
  removedSlugs: string[];
  changeNote: string | null;
  usage: PipelineUsage;
  verification: PageVerification[];
};

export async function runFirstBuildPipeline(args: {
  heavy: CopilotProvider;
  small: CopilotProvider;
  siteName: string;
  repoFullName: string | null;
  snapshot: RepoSnapshot;
  facts: RepoFacts;
}): Promise<PipelineResult> {
  const usage = blankUsage();
  const verification: PageVerification[] = [];
  const surface = extractProductSurface(args.snapshot, args.facts);
  const model = await refineProductModel(args.heavy, args.siteName, args.facts, args.snapshot, surface, usage);
  const facts = args.facts;
  const base = planPagesFromFacts({
    facts,
    treePaths: args.snapshot.treePaths,
    files: args.snapshot.files,
    model,
  });
  const suggested = await suggestPages(args.heavy, args.siteName, facts, base, model, usage);
  const plan = mergePagePlan({
    base,
    suggested,
    treePaths: args.snapshot.treePaths,
    facts,
  });
  const drafts = await writePlan({
    plan,
    heavy: args.heavy,
    small: args.small,
    siteName: args.siteName,
    repoFullName: args.repoFullName,
    facts,
    files: args.snapshot.files,
    treePaths: args.snapshot.treePaths,
    usage,
    verification,
    model,
  });
  const repaired = repairSiteLinks(drafts);
  return {
    pages: repaired.pages,
    removedSlugs: [],
    changeNote: model.promise.slice(0, 300) || null,
    usage,
    verification,
  };
}

export async function runPushPipeline(args: {
  heavy: CopilotProvider;
  small: CopilotProvider;
  siteName: string;
  repoFullName: string | null;
  facts: RepoFacts;
  files: RepoFile[];
  treePaths: string[];
  changedPaths: string[];
  removedPaths: string[];
  existingPages: PageDraft[];
}): Promise<PipelineResult> {
  const usage = blankUsage();
  const verification: PageVerification[] = [];
  const freshPlan = planPagesFromFacts({
    facts: args.facts,
    treePaths: args.treePaths,
    files: args.files,
  });
  const affected = pagesAffectedByChange({
    pages: args.existingPages,
    changedPaths: args.changedPaths,
    removedPaths: args.removedPaths,
    facts: args.facts,
  });
  const affectedSlugs = new Set(affected.map((page) => page.slug));
  const newApi = freshPlan.filter(
    (page) => page.kind === "api" && !args.existingPages.some((existing) => existing.slug === page.slug),
  );
  const routeChange = [...args.changedPaths, ...args.removedPaths].some((path) =>
    /route\.(?:ts|tsx|js|jsx)$/.test(path) || path.includes("pages/api/"),
  );
  const planned: PlannedPage[] = [];
  for (const page of freshPlan) {
    if (affectedSlugs.has(page.slug) || (routeChange && page.kind === "api") || newApi.some((item) => item.slug === page.slug)) {
      planned.push(page);
    }
  }
  for (const page of affected) {
    if (planned.some((item) => item.slug === page.slug)) continue;
    planned.push({
      slug: page.slug,
      section: page.section ?? "Guides",
      title: page.title,
      description: page.description ?? "",
      navOrder: page.navOrder,
      kind: page.slug.startsWith("api-reference") ? "api" : "guide",
      audience: args.facts.audience,
      reader: "integrator",
      question: page.description ?? page.title,
      sourcePaths: readSourcePaths(page.content),
      routes: page.slug.startsWith("api-reference") ? args.facts.routes : [],
    });
  }
  if (planned.length === 0) {
    return { pages: [], removedSlugs: [], changeNote: null, usage, verification };
  }
  const limited = planned.slice(0, 8);
  const drafts = await writePlan({
    plan: limited,
    heavy: args.heavy,
    small: args.small,
    siteName: args.siteName,
    repoFullName: args.repoFullName,
    facts: args.facts,
    files: args.files,
    treePaths: args.treePaths,
    usage,
    verification,
    previous: new Map(args.existingPages.map((page) => [page.slug, page.content])),
  });
  const removedSlugs = args.existingPages
    .filter((page) => page.slug.startsWith("api-reference/") && !freshPlan.some((item) => item.slug === page.slug))
    .map((page) => page.slug);
  const merged = mergeDrafts(args.existingPages, drafts, removedSlugs);
  const repaired = repairSiteLinks(merged);
  const changed = new Set([...drafts.map((page) => page.slug), ...removedSlugs]);
  const pages = repaired.pages.filter((page) => {
    if (changed.has(page.slug)) return true;
    const original = args.existingPages.find((item) => item.slug === page.slug);
    return Boolean(original && original.content !== page.content);
  });
  return {
    pages,
    removedSlugs,
    changeNote: `Updated ${drafts.length} page${drafts.length === 1 ? "" : "s"} from the push.`,
    usage,
    verification,
  };
}

export async function runChatPipeline(args: {
  heavy: CopilotProvider;
  small: CopilotProvider;
  siteName: string;
  repoFullName: string | null;
  facts: RepoFacts | null;
  files: RepoFile[];
  treePaths: string[];
  pages: PageDraft[];
  focusSlug: string | null;
  instruction: string;
}): Promise<PipelineResult> {
  const usage = blankUsage();
  const verification: PageVerification[] = [];
  const facts = args.facts;
  const chosen = await chooseChatPages(args.small, args, usage);
  const targets = args.pages.filter((page) => chosen.has(page.slug)).slice(0, 6);
  const selected = targets.length > 0 ? targets : args.pages.filter((page) => page.slug === (args.focusSlug ?? "")).slice(0, 1);
  const plan: PlannedPage[] = selected.map((page) => ({
    slug: page.slug,
    section: page.section ?? "Guides",
    title: page.title,
    description: page.description ?? "",
    navOrder: page.navOrder,
    kind: page.slug.startsWith("api-reference") ? "api" : page.slug === "" ? "home" : "guide",
    audience: facts?.audience ?? "app",
    reader: "integrator",
    question: page.description ?? page.title,
    sourcePaths: readSourcePaths(page.content),
    routes: facts && page.slug.startsWith("api-reference") ? facts.routes : [],
  }));
  if (plan.length === 0) {
    return {
      pages: [],
      removedSlugs: [],
      changeNote: null,
      usage,
      verification,
    };
  }
  const factsForWrite = facts ?? {
    audience: "app" as const,
    packageName: null,
    packageDescription: null,
    packageMain: null,
    binaries: [],
    routes: [],
    envVars: [],
    scripts: [],
    schemaModels: [],
    entryPoints: [],
    readmePath: null,
    readmeExcerpt: "",
  };
  const drafts = await writePlan({
    plan,
    heavy: args.heavy,
    small: args.small,
    siteName: args.siteName,
    repoFullName: args.repoFullName,
    facts: factsForWrite,
    files: args.files,
    treePaths: args.treePaths,
    usage,
    verification,
    previous: new Map(args.pages.map((page) => [page.slug, page.content])),
    instruction: args.instruction,
    verifyFacts: Boolean(facts),
  });
  const merged = mergeDrafts(args.pages, drafts, []);
  const repaired = repairSiteLinks(merged);
  return {
    pages: repaired.pages.filter((page) => drafts.some((draft) => draft.slug === page.slug)),
    removedSlugs: [],
    changeNote: args.instruction.slice(0, 300),
    usage,
    verification,
  };
}

async function refineProductModel(
  heavy: CopilotProvider,
  siteName: string,
  facts: RepoFacts,
  snapshot: RepoSnapshot,
  surface: ReturnType<typeof extractProductSurface>,
  usage: PipelineUsage,
): Promise<ProductModel> {
  const base = buildProductModel(surface, facts);
  const completion = await heavy.complete(
    modelRequest({
      siteName,
      kind: surface.kind,
      reader: base.reader,
      promise: base.promise,
      screens: surface.screens.map((screen) => `${screen.route} ${screen.title} (${screen.source})`),
      actions: surface.actions.map((action) => `${action.label} (${action.source})`),
      endpoints: surface.endpoints.slice(0, 20).map((route) => `${route.method} ${route.path}`),
    }),
  );
  addUsage(usage, "model", completion);
  try {
    const json = parseModelJson(completion.text);
    const jobs = Array.isArray(json.jobs) ? json.jobs.flatMap(readJob) : [];
    const nouns = Array.isArray(json.nouns) ? json.nouns.flatMap(readNoun) : [];
    const promise = typeof json.promise === "string" ? json.promise : "";
    return mergeProductModel(base, { promise, jobs, nouns }, snapshot.treePaths);
  } catch {
    return base;
  }
}

function readJob(value: unknown): ProductJob[] {
  if (!value || typeof value !== "object") return [];
  const job = value as { title?: unknown; slug?: unknown; question?: unknown; evidence?: unknown };
  const title = typeof job.title === "string" ? job.title.trim() : "";
  const evidence = Array.isArray(job.evidence) ? job.evidence.filter((item): item is string => typeof item === "string") : [];
  if (!title || evidence.length === 0) return [];
  const slug = typeof job.slug === "string" && job.slug.trim() ? job.slug.trim() : title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [{
    slug,
    title,
    question: typeof job.question === "string" && job.question.trim() ? job.question.trim() : `How do I ${title}?`,
    evidence,
  }];
}

function readNoun(value: unknown): ProductNoun[] {
  if (!value || typeof value !== "object") return [];
  const noun = value as { name?: unknown; slug?: unknown; evidence?: unknown };
  const name = typeof noun.name === "string" ? noun.name.trim() : "";
  const evidence = Array.isArray(noun.evidence) ? noun.evidence.filter((item): item is string => typeof item === "string") : [];
  if (!name || evidence.length === 0) return [];
  const slug = typeof noun.slug === "string" && noun.slug.trim() ? noun.slug.trim() : name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [{ slug, name, evidence }];
}

async function suggestPages(
  heavy: CopilotProvider,
  siteName: string,
  facts: RepoFacts,
  base: PlannedPage[],
  model: ProductModel,
  usage: PipelineUsage,
): Promise<PlannedPage[]> {
  const completion = await heavy.complete(
    planRequest({
      siteName,
      audience: facts.audience,
      reader: model.reader,
      promise: model.promise,
      factsDigest: factsDigest(facts, null),
      requiredSlugs: base.map((page) => page.slug || "(home)"),
    }),
  );
  addUsage(usage, "plan", completion);
  try {
    const json = parseModelJson(completion.text);
    const pages = Array.isArray(json.pages) ? json.pages : [];
    return pages.filter((page): page is PlannedPage => Boolean(page) && typeof page === "object");
  } catch {
    return [];
  }
}

async function chooseChatPages(
  small: CopilotProvider,
  args: {
    siteName: string;
    instruction: string;
    focusSlug: string | null;
    pages: PageDraft[];
  },
  usage: PipelineUsage,
): Promise<Set<string>> {
  const completion = await small.complete(
    chatPlanRequest({
      siteName: args.siteName,
      instruction: args.instruction,
      focusSlug: args.focusSlug,
      pages: args.pages.map((page) => ({
        slug: page.slug,
        title: page.title,
        description: page.description,
      })),
    }),
  );
  addUsage(usage, "chat-plan", completion);
  const known = new Set(args.pages.map((page) => page.slug));
  try {
    const json = parseModelJson(completion.text);
    const slugs = Array.isArray(json.slugs) ? json.slugs : [];
    const chosen = new Set<string>();
    for (const value of slugs) {
      if (typeof value !== "string") continue;
      const slug = value === "(home)" ? "" : value.trim();
      if (known.has(slug)) chosen.add(slug);
    }
    if (chosen.size > 0) return chosen;
  } catch {
    // Fall through to the focused page.
  }
  if (args.focusSlug !== null && known.has(args.focusSlug)) return new Set([args.focusSlug]);
  return new Set(args.pages.map((page) => page.slug));
}

async function writePlan(args: {
  plan: PlannedPage[];
  heavy: CopilotProvider;
  small: CopilotProvider;
  siteName: string;
  repoFullName: string | null;
  facts: RepoFacts;
  files: RepoFile[];
  treePaths: string[];
  usage: PipelineUsage;
  verification: PageVerification[];
  model?: ProductModel;
  previous?: Map<string, string>;
  instruction?: string;
  verifyFacts?: boolean;
}): Promise<PageDraft[]> {
  const digest = factsDigest(args.facts, args.repoFullName);
  const written = await pool(args.plan, PAGE_CONCURRENCY, async (page) => {
    if (args.usage.estimatedCostUsd >= COST_CEILING_USD) {
      const stub = factualPageContent(page, args.facts, args.repoFullName);
      args.verification.push({ slug: page.slug, violations: [], rewritten: false, stubbed: true });
      return draftFrom(page, stub.title, stub.description, stub.content);
    }
    const sources = sourceExcerpt(args.files, page.sourcePaths, SOURCE_BUDGET);
    const routeList = page.routes.map((route) => `${route.method} ${route.path} (${route.source})`).join("\n");
    let rewritten = false;
    let stubbed = false;
    let title = page.title;
    let description = page.description;
    let content = factualPageContent(page, args.facts, args.repoFullName).content;
    try {
      const completion = await args.heavy.complete(
        pageWriteRequest({
          siteName: args.siteName,
          repoFullName: args.repoFullName,
          page: {
            slug: page.slug,
            title: page.title,
            description: page.description,
            section: page.section,
            kind: page.kind,
            audience: page.audience,
            reader: page.reader,
            question: page.question,
          },
          factsDigest: args.instruction ? `${digest}\n\nEdit instruction:\n${args.instruction}` : digest,
          routeList,
          sources,
          previous: args.previous?.get(page.slug) ?? null,
        }),
      );
      addUsage(args.usage, `write:${page.slug || "home"}`, completion);
      const parsed = readWrittenPage(completion.text);
      if (parsed) {
        title = parsed.title || title;
        description = parsed.description || description;
        content = parsed.content;
      }
    } catch (error) {
      if (!isContractMiss(error)) throw error;
    }
    let violations =
      args.verifyFacts === false ? [] : verifyPage(content, args.facts, args.treePaths);
    let reasons = [
      ...violations.map((item) => `${item.kind} ${item.value}`),
      ...(args.model ? productCritique(content, page, args.model) : []),
    ];
    if (reasons.length === 0 && args.model && args.usage.estimatedCostUsd < COST_CEILING_USD) {
      try {
        const completion = await args.heavy.complete(
          pageCritiqueRequest({
            title,
            question: page.question,
            reader: page.reader,
            content,
            evidence: page.sourcePaths,
          }),
        );
        addUsage(args.usage, `critique:${page.slug || "home"}`, completion);
        const verdict = readCritique(completion.text);
        if (verdict && !verdict.pass) reasons = verdict.reasons;
      } catch (error) {
        if (!isContractMiss(error)) throw error;
      }
    }
    if (reasons.length > 0 && args.usage.estimatedCostUsd < COST_CEILING_USD) {
      rewritten = true;
      try {
        const completion = await args.small.complete(
          pageRewriteRequest({
            pageTitle: title,
            content,
            violations: reasons,
            factsDigest: digest,
          }),
        );
        addUsage(args.usage, `rewrite:${page.slug || "home"}`, completion);
        const parsed = readWrittenPage(completion.text);
        if (parsed?.content) {
          title = parsed.title || title;
          description = parsed.description || description;
          content = parsed.content;
        }
      } catch (error) {
        if (!isContractMiss(error)) throw error;
      }
      violations = args.verifyFacts === false ? [] : verifyPage(content, args.facts, args.treePaths);
      reasons = [
        ...violations.map((item) => `${item.kind} ${item.value}`),
        ...(args.model ? productCritique(content, page, args.model) : []),
      ];
    }
    const productReasons = args.model ? productCritique(content, page, args.model) : [];
    if (violations.length > 0 || (productReasons.length > 0 && page.kind === "home")) {
      const stub = factualPageContent(page, args.facts, args.repoFullName);
      title = stub.title;
      description = stub.description;
      content = stub.content;
      stubbed = true;
      violations = verifyPage(content, args.facts, args.treePaths);
    } else if (productReasons.length > 0) {
      return null;
    }
    args.verification.push({ slug: page.slug, violations, rewritten, stubbed });
    return draftFrom(page, title, description, withSources(content, page.sourcePaths));
  });
  return written.filter((page): page is PageDraft => page !== null);
}

function draftFrom(page: PlannedPage, title: string, description: string, content: string): PageDraft {
  return {
    slug: page.slug,
    section: page.section,
    title: title.slice(0, 120) || page.title,
    description: description ? description.slice(0, 280) : null,
    navOrder: page.navOrder,
    content,
  };
}

function readCritique(text: string): { pass: boolean; reasons: string[] } | null {
  try {
    const json = parseModelJson(text);
    if (typeof json.pass !== "boolean") return null;
    const reasons = Array.isArray(json.reasons)
      ? json.reasons.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
      : [];
    return { pass: json.pass, reasons: reasons.length > 0 ? reasons : ["The page does not answer its question."] };
  } catch {
    return null;
  }
}

function readWrittenPage(text: string): { title: string; description: string; content: string } | null {
  try {
    const json = parseModelJson(text);
    const content = typeof json.content === "string" ? json.content.trim() : "";
    if (!content) return null;
    return {
      title: typeof json.title === "string" ? json.title.trim() : "",
      description: typeof json.description === "string" ? json.description.trim() : "",
      content,
    };
  } catch {
    return null;
  }
}

function sourceExcerpt(files: RepoFile[], paths: string[], maxChars: number): string {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const parts: string[] = [];
  let used = 0;
  for (const path of paths) {
    const file = byPath.get(path);
    if (!file) continue;
    const slice = file.content.slice(0, 6_000);
    if (used + slice.length > maxChars) break;
    parts.push(`--- ${path}${file.truncated ? " (truncated)" : ""}\n${slice}`);
    used += slice.length;
  }
  return parts.join("\n\n");
}

function mergeDrafts(existing: PageDraft[], drafts: PageDraft[], removed: string[]): PageDraft[] {
  const removedSet = new Set(removed);
  const bySlug = new Map(existing.filter((page) => !removedSet.has(page.slug)).map((page) => [page.slug, page]));
  for (const draft of drafts) bySlug.set(draft.slug, draft);
  return [...bySlug.values()];
}

function isContractMiss(error: unknown): boolean {
  return error instanceof SyntaxError;
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function blankUsage(): PipelineUsage {
  return { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, stages: [] };
}

function addUsage(usage: PipelineUsage, stage: string, result: CompletionResult) {
  usage.promptTokens += result.promptTokens;
  usage.completionTokens += result.completionTokens;
  usage.estimatedCostUsd =
    Math.round((usage.estimatedCostUsd + result.estimatedCostUsd) * 1_000_000) / 1_000_000;
  usage.stages.push({
    stage,
    provider: result.provider,
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    estimatedCostUsd: result.estimatedCostUsd,
  });
}
