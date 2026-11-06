import { normalizeSlug } from "@/lib/copilot/contract";
import {
  isPlanSection,
  layoutForSection,
  type PageLayout,
  type PlanSection,
} from "@/lib/copilot/components";
import { MAX_DESCRIPTION_LENGTH, MAX_PLANNED_PAGES, MAX_TITLE_LENGTH } from "@/lib/copilot/limits";
import type { PageKind, PlannedPage } from "@/lib/copilot/page-plan";
import type { ProductArea } from "@/lib/copilot/batches";

export type StoredDocsPlan = {
  approved: boolean;
  replan: boolean;
  productRoot: string;
  products: ProductArea[];
  coverage: string;
  pages: PlannedPage[];
};

export type SubmittedPlanPage = {
  slug: string;
  title: string;
  section: string;
  description: string;
};

export function readStoredPlan(payload: unknown): StoredDocsPlan | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { docsPlan?: unknown }).docsPlan;
  if (!raw || typeof raw !== "object") return null;
  const plan = raw as Partial<StoredDocsPlan>;
  if (!Array.isArray(plan.pages)) return null;
  return {
    approved: plan.approved === true,
    replan: plan.replan === true,
    productRoot: typeof plan.productRoot === "string" ? plan.productRoot : "",
    products: Array.isArray(plan.products) ? plan.products.filter(isArea) : [],
    coverage: typeof plan.coverage === "string" ? plan.coverage : "",
    pages: plan.pages.filter(isPlannedPage),
  };
}

export function acceptOwnerPlan(input: {
  base: PlannedPage[];
  submitted: SubmittedPlanPage[];
}): { ok: true; plan: PlannedPage[] } | { ok: false; error: string } {
  if (!Array.isArray(input.submitted) || input.submitted.length === 0) {
    return { ok: false, error: "The outline needs at least one page." };
  }
  if (input.submitted.length > MAX_PLANNED_PAGES) {
    return { ok: false, error: `An outline can have at most ${MAX_PLANNED_PAGES} pages.` };
  }
  const baseBySlug = new Map(input.base.map((page) => [page.slug, page]));
  const seen = new Set<string>();
  const pages: PlannedPage[] = [];
  for (const raw of input.submitted) {
    const slug = normalizeSlug(raw.slug);
    if (slug === null) {
      return { ok: false, error: "A page slug is empty, reserved, or longer than 120 characters." };
    }
    if (seen.has(slug)) return { ok: false, error: `The slug "${slug || "(home)"}" is listed twice.` };
    seen.add(slug);
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title || title.length > MAX_TITLE_LENGTH) {
      return { ok: false, error: "Each page needs a title of 120 characters or fewer." };
    }
    if (!isPlanSection(raw.section)) {
      return { ok: false, error: "Each page must sit in Get Started, Concepts, How-to, or Reference." };
    }
    const description = typeof raw.description === "string" ? raw.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : "";
    const previous = baseBySlug.get(slug);
    const layout = layoutForSection(raw.section, slug);
    pages.push({
      slug,
      section: raw.section,
      title,
      description: description || previous?.description || "",
      navOrder: previous?.navOrder ?? 10 + pages.length,
      kind: kindForLayout(layout, previous?.kind),
      layout,
      audience: previous?.audience ?? input.base[0]?.audience ?? "app",
      reader: previous?.reader ?? input.base[0]?.reader ?? "integrator",
      question: description || previous?.question || title,
      sourcePaths: previous?.sourcePaths ?? [],
      routes: previous?.routes ?? [],
    });
  }
  return { ok: true, plan: pages };
}

function kindForLayout(layout: PageLayout, previous?: PageKind): PageKind {
  if (layout === "overview") return "home";
  if (layout === "concept") return "concept";
  if (layout === "reference") return previous === "api" ? "api" : "reference";
  return "guide";
}

function isArea(value: unknown): value is ProductArea {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<ProductArea>;
  return typeof area.id === "string" && typeof area.name === "string" && typeof area.root === "string";
}

function isPlannedPage(value: unknown): value is PlannedPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<PlannedPage>;
  return typeof page.slug === "string" && typeof page.title === "string" && typeof page.section === "string";
}

export type PlanSectionName = PlanSection;
