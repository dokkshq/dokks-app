import { layoutForSection, type PageLayout } from "@/lib/copilot/components";
import { normalizeSlug, type PageDraft } from "@/lib/copilot/contract";
import type { Audience, HttpRoute, RepoFacts } from "@/lib/copilot/facts";
import { MAX_PLANNED_PAGES, WRITER_SOURCE_PATHS } from "@/lib/copilot/limits";
import type { ProductModel } from "@/lib/copilot/product-model";
import { buildProductModel } from "@/lib/copilot/product-model";
import { extractProductSurface, type ProductSurface } from "@/lib/copilot/product-surface";
import { isDomainModule, type RepoSnapshot } from "@/lib/github/repo-content";

export type PageKind = "home" | "guide" | "concept" | "api" | "reference";

export type PlannedPage = {
  slug: string;
  section: string;
  title: string;
  description: string;
  navOrder: number;
  kind: PageKind;
  layout: PageLayout;
  audience: Audience;
  reader: "user" | "integrator";
  question: string;
  sourcePaths: string[];
  routes: HttpRoute[];
};

const MAX_PAGES = MAX_PLANNED_PAGES;

export function planPagesFromFacts(input: {
  facts: RepoFacts;
  treePaths: string[];
  files?: RepoSnapshot["files"];
  model?: ProductModel;
}): PlannedPage[] {
  const files = input.files ?? [];
  const surface = extractProductSurface({ files, treePaths: input.treePaths }, input.facts);
  const model = input.model ?? buildProductModel(surface, input.facts);
  return planPagesFromProduct({ facts: input.facts, surface, model, treePaths: input.treePaths });
}

export function planPagesFromProduct(input: {
  facts: RepoFacts;
  surface: ProductSurface;
  model: ProductModel;
  treePaths: string[];
}): PlannedPage[] {
  const facts = input.facts;
  const model = input.model;
  const tree = new Set(input.treePaths);
  const pages: PlannedPage[] = [];
  const readme = facts.readmePath && tree.has(facts.readmePath) ? [facts.readmePath] : [];
  const manifest = input.treePaths.filter((path) => {
    const name = path.split("/").pop() ?? "";
    return name === "package.json" || name.endsWith(".env.example") || name === "schema.prisma";
  });
  const domain = input.treePaths.filter((path) => tree.has(path) && isDomainModule(path));
  const reader = model.reader;
  const sources = (...groups: string[][]) => unique(groups.flat()).slice(0, WRITER_SOURCE_PATHS);

  const add = (page: PlannedPage) => {
    if (pages.length >= MAX_PAGES) return;
    if (pages.some((item) => item.slug === page.slug)) return;
    pages.push(page);
  };

  add({
    slug: "",
    section: "Get Started",
    title: facts.packageName ? titleFromPackage(facts.packageName) : "Overview",
    description: (model.promise || facts.packageDescription || "What this product does.").slice(0, 280),
    navOrder: 0,
    kind: "home",
    layout: "overview",
    audience: facts.audience,
    reader,
    question: "What is this?",
    sourcePaths: sources(readme, domain, manifest),
    routes: [],
  });

  add({
    slug: "getting-started",
    section: "Get Started",
    title: "Getting started",
    description: reader === "user" ? "The first thing to do in the product." : "Install it and run the first command.",
    navOrder: 10,
    kind: "guide",
    layout: "get-started",
    audience: facts.audience,
    reader,
    question: reader === "user" ? "How do I start using this?" : "How do I install this?",
    sourcePaths: sources(readme, manifest, domain),
    routes: [],
  });

  if (input.surface.errors.length > 0) {
    add({
      slug: "troubleshooting",
      section: "How-to",
      title: "Troubleshooting",
      description: "Errors the product actually reports.",
      navOrder: 30,
      kind: "guide",
      layout: "troubleshooting",
      audience: facts.audience,
      reader,
      question: "What do I do when something fails?",
      sourcePaths: sources(input.surface.errors.map((error) => error.source)),
      routes: [],
    });
  }

  if (reader === "integrator" && (facts.envVars.length > 0 || facts.schemaModels.length > 0)) {
    add({
      slug: "configuration",
      section: "Reference",
      title: "Configuration",
      description: "Settings required to run or call this product.",
      navOrder: 80,
      kind: "reference",
      layout: "reference",
      audience: facts.audience,
      reader,
      question: "Which settings does this require?",
      sourcePaths: sources(manifest.filter((path) => path.endsWith(".env.example") || path.endsWith("schema.prisma") || path.endsWith("package.json"))),
      routes: [],
    });
  }

  if (reader === "integrator" && (facts.audience === "library" || input.surface.kind === "library")) {
    add({
      slug: "reference",
      section: "Reference",
      title: "Reference",
      description: "Exports and entry points.",
      navOrder: 81,
      kind: "reference",
      layout: "reference",
      audience: facts.audience,
      reader,
      question: "What can I import?",
      sourcePaths: sources([...facts.entryPoints, facts.packageMain].filter((path): path is string => Boolean(path && tree.has(path)))),
      routes: [],
    });
  }

  if (input.surface.kind === "cli" || facts.binaries.length > 0) {
    add({
      slug: "commands",
      section: "Reference",
      title: "Commands",
      description: "Commands this tool actually ships.",
      navOrder: 82,
      kind: "reference",
      layout: "reference",
      audience: "cli",
      reader,
      question: "Which commands can I run?",
      sourcePaths: sources([...manifest, ...facts.binaries, ...facts.entryPoints].filter((path) => tree.has(path))),
      routes: [],
    });
  }

  if (reader === "integrator") {
    for (const page of apiPages(facts, tree, reader, MAX_PAGES - pages.length)) add(page);
  }

  return pages.filter((page) => page.slug !== "" || page.kind === "home").slice(0, MAX_PAGES);
}

export function mergePagePlan(input: {
  base: PlannedPage[];
  suggested: Array<Partial<PlannedPage> & { slug?: string; title?: string; sourcePaths?: string[] }>;
  treePaths: string[];
  facts: RepoFacts;
}): PlannedPage[] {
  const tree = new Set(input.treePaths);
  const bySlug = new Map(input.base.map((page) => [page.slug, page]));
  for (const raw of input.suggested) {
    const slug = normalizeSlug(raw.slug);
    if (slug === null) continue;
    if (bySlug.has(slug)) {
      const current = bySlug.get(slug)!;
      const extra = (raw.sourcePaths ?? []).filter((path) => tree.has(path));
      current.sourcePaths = unique([...current.sourcePaths, ...extra]).slice(0, WRITER_SOURCE_PATHS);
      if (
        typeof raw.description === "string" &&
        raw.description.trim() &&
        (raw.sourcePaths?.length ?? 0) > 0
      ) {
        current.description = raw.description.trim().slice(0, 280);
      }
      continue;
    }
    if (bySlug.size >= MAX_PAGES) continue;
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
    if (!title) continue;
    const sources = (raw.sourcePaths ?? []).filter((path) => tree.has(path)).slice(0, WRITER_SOURCE_PATHS);
    if (sources.length === 0 && slug !== "") continue;
    const kind = raw.kind === "api" || raw.kind === "guide" || raw.kind === "concept" || raw.kind === "reference" || raw.kind === "home"
      ? raw.kind
      : "guide";
    if (input.base[0]?.reader === "user" && (kind === "api" || slug.startsWith("api-reference"))) continue;
    const section = kind === "api" || kind === "reference" ? "Reference" : kind === "concept" ? "Concepts" : kind === "home" ? "Get Started" : "How-to";
    const layout = raw.layout ?? layoutForSection(section, slug);
    bySlug.set(slug, {
      slug,
      section,
      title,
      description: typeof raw.description === "string" ? raw.description.trim().slice(0, 280) : "",
      navOrder: typeof raw.navOrder === "number" ? raw.navOrder : 50 + bySlug.size,
      kind,
      layout: kind === "api" ? "reference" : layout,
      audience: input.facts.audience,
      reader: input.base[0]?.reader ?? "integrator",
      question: typeof raw.description === "string" ? raw.description.trim().slice(0, 200) : title,
      sourcePaths: sources,
      routes: [],
    });
  }
  return [...bySlug.values()].sort((a, b) => a.navOrder - b.navOrder || a.slug.localeCompare(b.slug)).slice(0, MAX_PAGES);
}

export function pagesAffectedByChange(input: {
  pages: PageDraft[];
  changedPaths: string[];
  removedPaths: string[];
  facts: RepoFacts;
}): PageDraft[] {
  const changed = new Set([...input.changedPaths, ...input.removedPaths]);
  if (changed.size === 0) return [];
  const routeTouched = [...changed].some((path) => /route\.(?:ts|tsx|js|jsx)$/.test(path) || /pages\/api\//.test(path) || path.endsWith("package.json") || path.endsWith(".env.example") || path.endsWith("schema.prisma") || /(^|\/)readme(\.[a-z0-9]+)?$/i.test(path));
  const selected: PageDraft[] = [];
  for (const page of input.pages) {
    const sources = readSourcePaths(page.content);
    const overlaps = sources.some((path) => changed.has(path));
    const apiPage = page.slug === "api-reference" || page.slug.startsWith("api-reference/");
    const setupPage = page.slug === "" || page.slug === "getting-started" || page.slug === "configuration" || page.slug === "commands";
    if (overlaps) {
      selected.push(page);
      continue;
    }
    if (apiPage && [...changed].some((path) => /route\.(?:ts|tsx|js|jsx)$/.test(path) || /pages\/api\//.test(path))) {
      selected.push(page);
      continue;
    }
    if (setupPage && routeTouched && [...changed].some((path) => path.endsWith("package.json") || path.endsWith(".env.example") || path.endsWith("schema.prisma") || /(^|\/)readme/i.test(path))) {
      selected.push(page);
    }
  }
  if (selected.length === 0 && input.facts.routes.length > 0 && [...changed].some((path) => /route\.(?:ts|tsx|js|jsx)$/.test(path))) {
    return input.pages.filter((page) => page.slug.startsWith("api-reference"));
  }
  return selected;
}

export function productCritique(
  content: string,
  page: PlannedPage,
  model: ProductModel,
): string[] {
  const reasons: string[] = [];
  if (model.reader === "user" && page.kind !== "reference" && /git clone/i.test(content)) {
    reasons.push("Tells a product user to clone the repository.");
  }
  if (page.kind === "guide" && content.trim().length < 40) {
    reasons.push("The page does not explain the job.");
  }
  if (page.kind !== "home" && !page.question) {
    reasons.push("The page does not answer a question.");
  }
  return reasons;
}

export function readSourcePaths(content: string): string[] {
  const match = content.match(/<!--\s*sources:\s*([^>]+?)\s*-->/);
  if (!match) return [];
  return match[1].split(/\s+/).filter(Boolean);
}

export function withSources(content: string, sources: string[]): string {
  const cleaned = content.replace(/\n*<!--\s*sources:[\s\S]*?-->\s*$/m, "").trim();
  const uniqueSources = unique(sources).slice(0, WRITER_SOURCE_PATHS);
  if (uniqueSources.length === 0) return cleaned;
  return `${cleaned}\n\n<!-- sources: ${uniqueSources.join(" ")} -->`;
}

function apiPages(facts: RepoFacts, tree: Set<string>, reader: PlannedPage["reader"], budget: number): PlannedPage[] {
  if (facts.routes.length === 0) return [];
  const groups = new Map<string, HttpRoute[]>();
  for (const route of facts.routes) {
    const parts = route.path.split("/").filter(Boolean);
    const key = parts[0] === "api" ? (parts[1] ?? "root") : (parts[0] ?? "root");
    const list = groups.get(key) ?? [];
    list.push(route);
    groups.set(key, list);
  }
  const sourcesFor = (routes: HttpRoute[]) =>
    unique(routes.map((route) => route.source)).filter((path) => tree.has(path)).slice(0, WRITER_SOURCE_PATHS);

  if (budget <= 0) return [];

  if (facts.routes.length <= 12 || groups.size <= 1 || budget < 2) {
    return [
      {
        slug: "api-reference",
        section: "Reference",
        title: "API reference",
        description: "HTTP routes exported by this repository.",
        navOrder: 40,
        kind: "api",
        layout: "reference",
        audience: facts.audience,
        reader,
        question: "Which endpoints can I call?",
        sourcePaths: sourcesFor(facts.routes),
        routes: facts.routes,
      },
    ];
  }

  const pages: PlannedPage[] = [
    {
      slug: "api-reference",
      section: "Reference",
      title: "API reference",
      description: "HTTP routes exported by this repository.",
      navOrder: 40,
      kind: "api",
      layout: "reference",
      audience: facts.audience,
      reader,
      question: "Which endpoints can I call?",
      sourcePaths: sourcesFor(facts.routes),
      routes: facts.routes,
    },
  ];
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let order = 41;
  for (const [key, routes] of entries) {
    if (pages.length >= budget) break;
    const slug = normalizeSlug(`api-reference/${key}`);
    if (!slug) continue;
    pages.push({
      slug,
      section: "Reference",
      title: titleFromSegment(key),
      description: `Routes under /${routes[0]?.path.split("/").filter(Boolean).slice(0, 2).join("/") ?? key}.`,
      navOrder: order,
      kind: "api",
      layout: "reference",
      audience: facts.audience,
      reader,
      question: `Which endpoints live under ${key}?`,
      sourcePaths: sourcesFor(routes),
      routes,
    });
    order += 1;
  }
  return pages;
}

export function factualPageContent(
  page: PlannedPage,
  facts: RepoFacts,
  repoFullName: string | null,
): { title: string; description: string; content: string } {
  const blocks: string[] = [];
  if (page.kind === "home") {
    const excerpt = facts.readmeExcerpt
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .slice(0, 2)
      .join(" ");
    blocks.push(page.description || facts.packageDescription || excerpt || `${page.title} documentation.`);
    if (page.reader === "integrator" && facts.routes.length > 0) {
      blocks.push(`## What you can call\n\n${facts.routes.slice(0, 8).map((route) => `- \`${route.method} ${route.path}\``).join("\n")}`);
    }
  } else if (page.slug === "getting-started" && page.reader === "user") {
    blocks.push(page.description || facts.packageDescription || "Start in the product.");
  } else if (page.slug === "getting-started" && page.reader === "integrator") {
    blocks.push("## Steps");
    const steps: string[] = [];
    if (repoFullName) steps.push(`Clone the repository.\n\n\`\`\`bash\ngit clone https://github.com/${repoFullName}.git\ncd ${repoFullName.split("/")[1] ?? repoFullName}\n\`\`\``);
    if (facts.scripts.length > 0 || facts.packageName) steps.push("Install dependencies.\n\n```bash\nnpm install\n```");
    if (facts.envVars.length > 0) {
      steps.push(`Create an environment file with:\n\n${facts.envVars.slice(0, 12).map((item) => `- \`${item.name}\``).join("\n")}`);
    }
    const migrate = facts.scripts.find((script) => /migrate|db/.test(script.name));
    if (migrate) {
      steps.push(`Apply the database schema.\n\n\`\`\`bash\nnpm run ${migrate.name}\n\`\`\``);
    } else if (facts.schemaModels.length > 0) {
      steps.push(`This project stores data in: ${facts.schemaModels.map((model) => model.name).join(", ")}.`);
    }
    const dev = facts.scripts.find((script) => script.name === "dev" || script.name === "start");
    if (dev) steps.push(`Start the project.\n\n\`\`\`bash\nnpm run ${dev.name}\n\`\`\``);
    blocks.push(steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n"));
  } else if (page.slug === "configuration") {
    if (facts.envVars.length > 0) {
      blocks.push(`## Environment\n\n${facts.envVars.map((item) => `- \`${item.name}\` from \`${item.source}\`${item.example ? `: \`${item.example}\`` : ""}`).join("\n")}`);
    }
    if (facts.schemaModels.length > 0) {
      blocks.push(`## Data\n\n${facts.schemaModels.map((model) => `- \`${model.name}\`: ${model.fields.slice(0, 8).join(", ")}`).join("\n")}`);
    }
  } else if (page.kind === "api") {
    const routes = page.routes.length > 0 ? page.routes : facts.routes;
    blocks.push("## Routes\n\n| Method | Path | Source |\n| --- | --- | --- |\n" + routes.map((route) => `| ${route.method} | \`${route.path}\` | \`${route.source}\` |`).join("\n"));
  } else if (page.slug === "commands") {
    blocks.push(facts.scripts.map((script) => `## \`${script.name}\`\n\n\`\`\`bash\nnpm run ${script.name}\n\`\`\`\n\n\`${script.command}\``).join("\n\n"));
  } else {
    blocks.push(facts.packageDescription ?? page.description);
    if (page.sourcePaths.length > 0) {
      blocks.push(`## Source\n\n${page.sourcePaths.map((path) => `- \`${path}\``).join("\n")}`);
    }
  }
  const content = withSources(blocks.filter(Boolean).join("\n\n"), page.sourcePaths);
  return {
    title: page.title,
    description: page.description,
    content,
  };
}

function titleFromPackage(name: string): string {
  const bare = name.split("/").pop() ?? name;
  return bare
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleFromSegment(key: string): string {
  if (key === "root") return "API routes";
  return titleFromPackage(key);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
