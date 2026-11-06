import { normalizeSlug } from "@/lib/copilot/contract";
import type { RepoFacts } from "@/lib/copilot/facts";
import { MAX_PLANNED_PAGES } from "@/lib/copilot/limits";
import type { ProductKind, ProductSurface } from "@/lib/copilot/product-surface";

export type ProductReader = "user" | "integrator";

export type ProductJob = {
  slug: string;
  title: string;
  question: string;
  evidence: string[];
};

export type ProductNoun = {
  slug: string;
  name: string;
  evidence: string[];
};

export type ProductModel = {
  kind: ProductKind;
  reader: ProductReader;
  promise: string;
  jobs: ProductJob[];
  nouns: ProductNoun[];
};

export function buildProductModel(surface: ProductSurface, facts: RepoFacts): ProductModel {
  const reader: ProductReader = surface.kind === "hosted-app" ? "user" : "integrator";
  const jobs: ProductJob[] = [];
  const nouns: ProductNoun[] = [];

  if (reader === "integrator") {
    const evidence = unique([
      facts.readmePath ?? "",
      ...surface.scripts.map(() => "package.json"),
      ...surface.endpoints.map((route) => route.source),
    ]).slice(0, MAX_PLANNED_PAGES);
    jobs.push({
      slug: "getting-started",
      title: "Getting started",
      question:
        surface.kind === "cli"
          ? "How do I run the first command?"
          : "How do I install this and make the first call?",
      evidence,
    });
  }

  if (reader === "integrator") {
    for (const model of facts.schemaModels) {
      const slug = slugify(model.name);
      if (!slug) continue;
      nouns.push({ slug, name: model.name, evidence: [model.source] });
      if (nouns.length >= MAX_PLANNED_PAGES) break;
    }
  }

  return {
    kind: surface.kind,
    reader,
    promise: surface.promise || `${surface.name} documentation.`,
    jobs,
    nouns,
  };
}

export function mergeProductModel(
  base: ProductModel,
  extra: { promise?: string; jobs?: ProductJob[]; nouns?: ProductNoun[] },
  treePaths: string[],
): ProductModel {
  const tree = new Set(treePaths);
  const jobs = [...base.jobs];
  for (const job of extra.jobs ?? []) {
    const evidence = job.evidence.filter((path) => tree.has(path));
    if (!job.title || evidence.length === 0) continue;
    const slug = slugify(job.slug) || slugify(job.title);
    if (!slug || jobs.length >= MAX_PLANNED_PAGES) continue;
    if (jobs.some((item) => item.slug === slug || item.title.toLowerCase() === job.title.toLowerCase())) continue;
    jobs.push({ ...job, slug, evidence });
  }
  const nouns = [...base.nouns];
  for (const noun of extra.nouns ?? []) {
    const evidence = noun.evidence.filter((path) => tree.has(path));
    const slug = slugify(noun.slug) || slugify(noun.name);
    if (!noun.name || !slug || evidence.length === 0) continue;
    if (nouns.some((item) => item.slug === slug)) continue;
    if (nouns.length >= MAX_PLANNED_PAGES) break;
    nouns.push({ ...noun, slug, evidence });
  }
  const promise = extra.promise?.trim() || base.promise;
  return { ...base, promise: promise.slice(0, 280), jobs, nouns };
}

export function slugify(value: string): string {
  const slug = normalizeSlug(value);
  return slug ?? "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
