import type { RepoFacts } from "@/lib/copilot/facts";
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

  if (reader === "user") {
    for (const screen of surface.screens) {
      const slug = slugify(screen.title) || slugify(screen.route);
      if (!slug || jobs.some((job) => job.slug === slug)) continue;
      jobs.push({
        slug,
        title: screen.title,
        question: `How do I use ${screen.title}?`,
        evidence: [screen.source],
      });
    }
    for (const action of surface.actions) {
      const slug = slugify(action.label);
      if (!slug || jobs.some((job) => job.slug === slug || job.title.toLowerCase() === action.label.toLowerCase())) continue;
      jobs.push({
        slug,
        title: action.label,
        question: `How do I ${action.label.charAt(0).toLowerCase()}${action.label.slice(1)}?`,
        evidence: [action.source],
      });
      if (jobs.length >= 6) break;
    }
  } else {
    const evidence = unique([
      facts.readmePath ?? "",
      ...surface.scripts.map(() => "package.json"),
      ...surface.endpoints.map((route) => route.source),
    ]).slice(0, 6);
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
    for (const model of facts.schemaModels.slice(0, 3)) {
      const slug = slugify(model.name);
      if (!slug) continue;
      nouns.push({ slug, name: model.name, evidence: [model.source] });
    }
  }

  return {
    kind: surface.kind,
    reader,
    promise: surface.promise || `${surface.name} documentation.`,
    jobs: jobs.slice(0, 6),
    nouns: nouns.slice(0, 3),
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
    if (jobs.some((item) => item.slug === job.slug || item.title.toLowerCase() === job.title.toLowerCase())) continue;
    if (jobs.length >= 6) break;
    jobs.push({ ...job, evidence });
  }
  const nouns = [...base.nouns];
  for (const noun of extra.nouns ?? []) {
    const evidence = noun.evidence.filter((path) => tree.has(path));
    if (!noun.name || evidence.length === 0) continue;
    if (nouns.some((item) => item.slug === noun.slug)) continue;
    if (nouns.length >= 3) break;
    nouns.push({ ...noun, evidence });
  }
  const promise = extra.promise?.trim() || base.promise;
  return { ...base, promise: promise.slice(0, 280), jobs, nouns };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
