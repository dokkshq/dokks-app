export const PAGE_LAYOUTS = [
  "overview",
  "get-started",
  "concept",
  "how-to",
  "reference",
  "troubleshooting",
] as const;

export type PageLayout = (typeof PAGE_LAYOUTS)[number];

export const PLAN_SECTIONS = ["Get Started", "Concepts", "How-to", "Reference"] as const;

export type PlanSection = (typeof PLAN_SECTIONS)[number];

export function isPageLayout(value: string): value is PageLayout {
  return (PAGE_LAYOUTS as readonly string[]).includes(value);
}

export function isPlanSection(value: string): value is PlanSection {
  return (PLAN_SECTIONS as readonly string[]).includes(value);
}

/** Map a leftover or missing section onto Get Started, Concepts, How-to, or Reference. */
export function normalizePlanSection(section: string | null | undefined): PlanSection {
  const raw = (section ?? "").trim();
  if (isPlanSection(raw)) return raw;
  const key = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (
    key === "start" ||
    key === "home" ||
    key === "welcome" ||
    key === "overview" ||
    key === "introduction" ||
    key.startsWith("get started") ||
    key.startsWith("getting started")
  ) {
    return "Get Started";
  }
  if (key.includes("concept") || key === "explanation" || key === "explain") return "Concepts";
  if (key.includes("reference") || key === "api" || key.startsWith("api ")) return "Reference";
  return "How-to";
}

export function layoutForSection(section: string, slug: string): PageLayout {
  if (slug === "") return "overview";
  if (section === "Get Started") return "get-started";
  if (section === "Concepts") return "concept";
  if (section === "Reference") return "reference";
  return "how-to";
}

export const WRITER_COMPONENT_GUIDE = [
  "Each page uses exactly one layout: overview, get-started, concept, how-to, reference, or troubleshooting.",
  "Put that layout in the JSON layout field. Do not mix two layouts on one page. Keep nesting shallow.",
  "Use these blocks when they match the content. Do not use them as decoration.",
  "Cards are only for choices that go to another page, never for body copy:",
  ":::cards",
  "[Get started](/getting-started)",
  "Install and run.",
  "---",
  "[Reference](/reference)",
  "Look up commands.",
  ":::",
  "Steps when order matters:",
  ":::steps",
  "1. Install dependencies",
  "2. Start the app",
  ":::",
  "Tabs and code groups are for true alternatives, such as npm and pnpm or two languages:",
  ":::tabs",
  "== npm",
  "npm install",
  "== pnpm",
  "pnpm add",
  ":::",
  ":::code-group",
  "== bash npm",
  "npm install",
  "== bash pnpm",
  "pnpm add",
  ":::",
  "Callouts are rare. Use a GitHub alert: > [!NOTE], > [!TIP], > [!WARNING], or > [!DANGER].",
  "Accordions hold optional detail:",
  ":::accordion",
  "== Optional detail",
  "Only read this if you need it.",
  ":::",
  "Frames wrap a real image that is already in the source. Never invent a screenshot:",
  ":::frame",
  "![Settings](https://example.com/settings.png)",
  ":::",
  "Trees show a file layout:",
  ":::tree",
  "src/",
  "  lib/",
  ":::",
  "Field lists and request or response examples belong on API pages:",
  ":::fields",
  "name | string | required | Display name",
  ":::",
  ":::request",
  "POST /api/items",
  ":::",
  ":::response",
  "200 { \"id\": \"1\" }",
  ":::",
  "Banners, badges, tooltips, and prompt boxes are available when the page needs them:",
  ":::banner",
  "This endpoint is stable.",
  ":::",
  ":::badge",
  "Beta",
  ":::",
  ":::tooltip",
  "webhook | A URL the product calls when something happens",
  ":::",
  ":::prompt",
  "Summarize the repository in one paragraph.",
  ":::",
].join("\n");
