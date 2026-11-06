import {
  MAX_CONTENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PLANNED_PAGES,
  MAX_SECTION_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
} from "@/lib/copilot/limits";

export type PageDraft = {
  slug: string;
  section: string | null;
  title: string;
  description: string | null;
  navOrder: number;
  content: string;
};

export type GenerationResult = {
  pages: PageDraft[];
  removedSlugs: string[];
  changeNote: string | null;
};

export type ParseOptions = {
  allowEmpty: boolean;
  maxPages?: number;
  requireHome?: boolean;
};

const MAX_PAGES = MAX_PLANNED_PAGES;

const RESERVED_SLUGS = new Set([
  "api",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export class GenerationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationContractError";
  }
}

export function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const parts = trimmed
    .toLowerCase()
    .replace(/[_\s.]+/g, "-")
    .replace(/[^a-z0-9\-/]+/g, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((part) => part.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
  if (parts.length === 0) {
    // Home page only when the input was empty or slash-only.
    return !trimmed || /^\/+$/.test(trimmed) ? "" : null;
  }
  const slug = parts.join("/");
  if (slug.length > MAX_SLUG_LENGTH) return null;
  if (parts.some((part) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))) {
    return null;
  }
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export function parseGenerationResult(
  text: string,
  options: ParseOptions,
): GenerationResult {
  const parsed = parseJsonObject(text);
  const rawPages = parsed.pages;
  if (!Array.isArray(rawPages)) {
    throw new GenerationContractError("The model did not return a pages array.");
  }
  const maxPages = Math.min(options.maxPages ?? MAX_PAGES, MAX_PAGES);
  if (rawPages.length > maxPages) {
    throw new GenerationContractError(`The model returned more than ${maxPages} pages.`);
  }
  if (!options.allowEmpty && rawPages.length === 0) {
    throw new GenerationContractError("The model returned no pages.");
  }

  const seen = new Set<string>();
  const pages: PageDraft[] = [];
  for (const raw of rawPages) {
    const page = parsePage(raw);
    if (seen.has(page.slug)) {
      throw new GenerationContractError(`The model returned the slug "${page.slug}" twice.`);
    }
    seen.add(page.slug);
    pages.push(page);
  }
  if (options.requireHome && !seen.has("")) {
    throw new GenerationContractError("The model did not return a home page.");
  }

  const rawRemoved = parsed.removedSlugs;
  const removedSlugs: string[] = [];
  if (rawRemoved !== undefined) {
    if (!Array.isArray(rawRemoved)) {
      throw new GenerationContractError("removedSlugs must be an array.");
    }
    for (const value of rawRemoved) {
      const slug = normalizeSlug(value);
      if (slug === null || slug === "") {
        const shown =
          typeof value === "string" ? value.trim().slice(0, 80) : String(value);
        throw new GenerationContractError(
          `removedSlugs contains an invalid slug: "${shown}".`,
        );
      }
      if (!removedSlugs.includes(slug)) removedSlugs.push(slug);
    }
  }

  const changeNote = readOptionalText(parsed.changeNote, 300);
  return { pages, removedSlugs, changeNote };
}

function parsePage(value: unknown): PageDraft {
  if (!value || typeof value !== "object") {
    throw new GenerationContractError("A page entry is not an object.");
  }
  const raw = value as Record<string, unknown>;
  const slug = normalizeSlug(raw.slug);
  if (slug === null) {
    const shown =
      typeof raw.slug === "string" ? raw.slug.trim().slice(0, 80) : String(raw.slug);
    throw new GenerationContractError(`A page has an invalid slug: "${shown}".`);
  }
  const title = readRequiredText(raw.title, MAX_TITLE_LENGTH, "title");
  const content = readRequiredText(raw.content, MAX_CONTENT_LENGTH, "content");
  if (slug === "" && title.length === 0) {
    throw new GenerationContractError("The home page needs a title.");
  }
  const section = readOptionalText(raw.section, MAX_SECTION_LENGTH);
  const description = readOptionalText(raw.description, MAX_DESCRIPTION_LENGTH);
  const navOrder =
    typeof raw.navOrder === "number" && Number.isFinite(raw.navOrder)
      ? Math.max(0, Math.min(10_000, Math.trunc(raw.navOrder)))
      : 0;
  return { slug, section, title, description, navOrder, content };
}

export function parseModelJson(text: string): Record<string, unknown> {
  return parseJsonObject(text);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new GenerationContractError("The model did not return a JSON object.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new GenerationContractError("The model returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GenerationContractError("The model did not return a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function readRequiredText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string") {
    throw new GenerationContractError(`A page is missing its ${field}.`);
  }
  const text = value.trim();
  if (!text) {
    throw new GenerationContractError(`A page has an empty ${field}.`);
  }
  if (text.length > max) {
    throw new GenerationContractError(`A page ${field} is too long.`);
  }
  return text;
}

function readOptionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new GenerationContractError("A page text field is not a string.");
  }
  const text = value.trim();
  if (text.length > max) {
    throw new GenerationContractError("A page text field is too long.");
  }
  return text || null;
}

export function draftFromGeneration(page: PageDraft): PageDraft {
  return {
    ...page,
    section: page.section?.trim() || null,
    description: page.description?.trim() || null,
  };
}
