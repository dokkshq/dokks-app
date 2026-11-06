import type { PlannedPage } from "@/lib/copilot/page-plan";
import type { RepoFacts } from "@/lib/copilot/facts";

const STUB =
  /^(?:todo|tbd|coming soon|placeholder|this page is a stub|stub|wip)\b/i;
const MARKETING =
  /\b(revolutionary|game-changing|seamless|next-generation|supercharge|cutting-edge|unlock your)\b/i;

export function pageQualityIssues(input: {
  page: Pick<PlannedPage, "slug" | "title" | "kind" | "layout">;
  content: string;
  facts: RepoFacts | null;
  siblings: Array<{ slug: string; title: string }>;
}): string[] {
  const reasons: string[] = [];
  const body = input.content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  const firstLine = body.split("\n").find((line) => line.trim())?.trim() ?? "";
  if (!body || STUB.test(firstLine) || /^see the source\.?$/i.test(body)) {
    reasons.push("The page is a stub.");
  } else if (body.length < 40) {
    reasons.push("The page is too thin to be useful.");
  }
  if (isFileDump(body)) reasons.push("The page is a file dump.");
  const titleKey = normalizeTitle(input.page.title);
  if (
    titleKey &&
    input.siblings.some(
      (sibling) => sibling.slug !== input.page.slug && normalizeTitle(sibling.title) === titleKey,
    )
  ) {
    reasons.push("The page duplicates another page.");
  }
  if ((input.page.slug === "" || input.page.layout === "overview" || input.page.kind === "home") && isMarketingHome(body, input.facts)) {
    reasons.push("The home page is marketing copy.");
  }
  if (
    (input.page.layout === "how-to" || input.page.kind === "guide") &&
    input.page.slug !== "" &&
    body.length < 80 &&
    !/(?:^|\n)\s*(?:\d+[.)]|:::steps)/.test(input.content)
  ) {
    reasons.push("The page does not explain the task.");
  }
  return reasons;
}

function isFileDump(body: string): boolean {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  const pathLike = lines.filter((line) =>
    /^(?:[-*]|\d+[.)])?\s*`?(?:[\w.@-]+\/)+[\w.@-]+`?\s*$/.test(line),
  ).length;
  const words = body.split(/\s+/).filter((word) => /[A-Za-z]{4,}/.test(word) && !word.includes("/"));
  return pathLike / lines.length >= 0.6 && words.length < 40;
}

function isMarketingHome(body: string, facts: RepoFacts | null): boolean {
  if (!MARKETING.test(body)) return false;
  const concrete = [facts?.packageName, facts?.packageDescription].filter(Boolean).join(" ").toLowerCase();
  if (!concrete) return true;
  return !body.toLowerCase().includes(concrete.slice(0, 24).toLowerCase());
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
