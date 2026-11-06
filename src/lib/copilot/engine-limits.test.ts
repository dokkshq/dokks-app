import { describe, expect, it } from "vitest";
import { pageWriteRequest } from "@/lib/copilot/prompts";
import { slugify } from "@/lib/copilot/product-model";
import {
  DEFAULT_FIRST_BUILD_CAP_USD,
  DEFAULT_GLOBAL_DAILY_CAP_USD,
  DEFAULT_REPO_DAILY_CAP_USD,
  FIRST_BUILD_DIGEST_CHARS,
  MAX_CONTENT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_CHARS,
  MAX_PATCH_CHARS,
  MAX_PLANNED_PAGES,
  MAX_SECTION_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_SNAPSHOT_CHARS,
  MAX_SNAPSHOT_FILES,
  MAX_TITLE_LENGTH,
  MAX_TREE_PATHS,
  PIPELINE_COST_CEILING_USD,
  PUSH_DIGEST_CHARS,
  WRITE_CONCURRENCY,
  WRITER_FILE_CHARS,
  WRITER_SOURCE_CHARS,
  WRITER_SOURCE_PATHS,
} from "@/lib/copilot/limits";
import { GITHUB_REQUEST_TIMEOUT_MS } from "@/lib/github/repo-content";
import { batchPaths, chooseProductArea, coverageNote, detectProductAreas, inProductArea, mergeFacts } from "@/lib/copilot/batches";
import { extractFacts } from "@/lib/copilot/facts";
import { acceptOwnerPlan } from "@/lib/copilot/plan-gate";
import { pageQualityIssues } from "@/lib/copilot/review";
import type { PlannedPage } from "@/lib/copilot/page-plan";
import { parseDocsBlocks } from "@/components/docs/blocks";

describe("docs engine ceilings", () => {
  it("keeps the spend brakes and raises the one-pass read limits", () => {
    expect(PIPELINE_COST_CEILING_USD).toBe(6);
    expect(DEFAULT_FIRST_BUILD_CAP_USD).toBe(8);
    expect(DEFAULT_GLOBAL_DAILY_CAP_USD).toBe(25);
    expect(DEFAULT_REPO_DAILY_CAP_USD).toBe(6);
    expect(MAX_SNAPSHOT_FILES).toBe(400);
    expect(MAX_SNAPSHOT_CHARS).toBe(1_000_000);
    expect(MAX_FILE_CHARS).toBe(60_000);
    expect(MAX_TREE_PATHS).toBe(2_000);
    expect(MAX_PATCH_CHARS).toBe(30_000);
    expect(WRITER_SOURCE_CHARS).toBe(48_000);
    expect(WRITER_FILE_CHARS).toBe(24_000);
    expect(WRITER_SOURCE_PATHS).toBe(20);
    expect(MAX_PLANNED_PAGES).toBe(20);
    expect(FIRST_BUILD_DIGEST_CHARS).toBe(200_000);
    expect(PUSH_DIGEST_CHARS).toBe(48_000);
    expect(WRITE_CONCURRENCY).toBe(4);
    expect(GITHUB_REQUEST_TIMEOUT_MS).toBe(20_000);
    expect(MAX_TITLE_LENGTH).toBe(120);
    expect(MAX_DESCRIPTION_LENGTH).toBe(280);
    expect(MAX_SECTION_LENGTH).toBe(80);
    expect(MAX_SLUG_LENGTH).toBe(120);
    expect(MAX_CONTENT_LENGTH).toBe(100_000);
  });

  it("rejects a slug longer than 120 characters instead of slicing it", () => {
    expect(slugify("getting-started")).toBe("getting-started");
    expect(slugify("a".repeat(121))).toBe("");
    expect(slugify("a".repeat(120))).toBe("a".repeat(120));
  });
});

describe("understanding batches", () => {
  it("merges batches into one picture and says what a second product was not covering", () => {
    const paths = [
      "README.md",
      "package.json",
      "packages/cli/package.json",
      "packages/cli/src/index.ts",
      "apps/web/package.json",
      "apps/web/src/app/page.tsx",
    ];
    const areas = detectProductAreas(paths);
    expect(areas.map((area) => area.root).sort()).toEqual(["", "apps/web", "packages/cli"]);
    const choice = chooseProductArea(areas, "Widget");
    expect(choice.ambiguous).toBe(true);
    expect(choice.area.root).toBe("");
    expect(inProductArea("apps/web/src/app/page.tsx", "", ["apps/web", "packages/cli"])).toBe(false);
    expect(inProductArea("README.md", "", ["apps/web", "packages/cli"])).toBe(true);
    const batches = batchPaths(
      Array.from({ length: 401 }, (_, index) => `src/lib/file-${index}.ts`),
      400,
    );
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(400);
    const merged = mergeFacts([
      extractFacts({
        treePaths: ["README.md", "package.json"],
        files: [
          { path: "README.md", content: "# Widget\n\nA long readme.".padEnd(80, " "), truncated: false },
          { path: "package.json", content: JSON.stringify({ name: "widget", scripts: { dev: "next dev" } }), truncated: false },
        ],
      }),
      extractFacts({
        treePaths: ["src/app/api/health/route.ts"],
        files: [
          { path: "src/app/api/health/route.ts", content: "export function GET() { return new Response(''); }", truncated: false },
        ],
      }),
    ]);
    expect(merged.packageName).toBe("widget");
    expect(merged.routes.map((route) => route.path)).toContain("/api/health");
    expect(merged.readmeExcerpt).toContain("Widget");
    const note = coverageNote({
      area: choice.area,
      others: choice.others,
      ambiguous: choice.ambiguous,
      batches: 2,
      considered: 401,
      read: 400,
      treeTruncated: false,
    });
    expect(note).toContain("apps/web");
    expect(note).toContain("packages/cli");
    expect(note).toContain("not include");
  });
});

describe("plan gate", () => {
  it("rejects an overlong slug and keeps an edited outline", () => {
    const base = [page("")];
    const rejected = acceptOwnerPlan({
      base,
      submitted: [{ slug: "a".repeat(121), title: "Too long", section: "How-to", description: "" }],
    });
    expect(rejected.ok).toBe(false);
    const accepted = acceptOwnerPlan({
      base,
      submitted: [
        { slug: "", title: "Widget", section: "Get Started", description: "What it is." },
        { slug: "ship-it", title: "Ship it", section: "How-to", description: "How to ship." },
      ],
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.plan.map((item) => item.layout)).toEqual(["overview", "how-to"]);
    }
  });
});

describe("page review", () => {
  it("rejects stubs, file dumps, marketing homes, and duplicate titles", () => {
    const home = page("");
    expect(pageQualityIssues({ page: home, content: "TODO", facts: null, siblings: [] })).toContain("The page is a stub.");
    expect(
      pageQualityIssues({
        page: home,
        content: "This revolutionary product will supercharge your workflow.",
        facts: { ...emptyFacts, packageName: "widget", packageDescription: "A widget." },
        siblings: [],
      }),
    ).toContain("The home page is marketing copy.");
    const dump = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"].join("\n");
    expect(pageQualityIssues({ page: page("files"), content: dump, facts: null, siblings: [] })).toContain(
      "The page is a file dump.",
    );
    expect(
      pageQualityIssues({
        page: page("files"),
        content: "A useful page that explains the files in enough detail to follow.",
        facts: null,
        siblings: [page("other")],
      }).some((reason) => reason.includes("duplicate")),
    ).toBe(true);
  });
});

describe("writer guidance and renderer blocks", () => {
  it("teaches layouts and component rules in the writer prompt", () => {
    const request = pageWriteRequest({
      siteName: "Plugr",
      repoFullName: "ada/plugr",
      page: {
        slug: "getting-started",
        title: "Getting started",
        description: "Install",
        section: "Get Started",
        kind: "guide",
        layout: "get-started",
        audience: "app",
        reader: "integrator",
        question: "How do I install this?",
      },
      nav: "- (home): Plugr [overview]",
      factsDigest: "Audience: app",
      routeList: "",
      sources: "",
    });
    for (const layout of ["overview", "get-started", "concept", "how-to", "reference", "troubleshooting"]) {
      expect(request.system).toContain(layout);
    }
    expect(request.system).toContain("Cards are only for choices");
    expect(request.system).toContain(":::code-group");
    expect(request.system).toContain("[!DANGER]");
    expect(request.user).toContain("Layout: get-started");
    expect(request.user).toContain("(home): Plugr");
  });

  it("parses every docs block the renderer knows", () => {
    const content = [
      "<!-- layout: how-to -->",
      "Intro",
      ":::cards",
      "[Next](/next)",
      "Go on.",
      ":::",
      ":::steps",
      "1. One",
      "2. Two",
      ":::",
      ":::tabs",
      "== npm",
      "npm install",
      "== pnpm",
      "pnpm add",
      ":::",
      ":::code-group",
      "== bash npm",
      "npm install",
      ":::",
      ":::accordion",
      "== Extra",
      "Optional.",
      ":::",
      ":::note",
      "A note.",
      ":::",
      ":::frame",
      "![Shot](https://example.com/shot.png)",
      ":::",
      ":::tree",
      "src/",
      ":::",
      ":::fields",
      "name | string | required | Display name",
      ":::",
      ":::request",
      "POST /api",
      ":::",
      ":::response",
      "200",
      ":::",
      ":::banner",
      "Stable.",
      ":::",
      ":::badge",
      "Beta",
      ":::",
      ":::tooltip",
      "webhook | A callback URL",
      ":::",
      ":::prompt",
      "Summarize this.",
      ":::",
    ].join("\n");
    const parsed = parseDocsBlocks(content);
    expect(parsed.layout).toBe("how-to");
    expect(parsed.blocks.map((block) => block.type)).toEqual([
      "markdown",
      "cards",
      "steps",
      "tabs",
      "code-group",
      "accordion",
      "callout",
      "frame",
      "tree",
      "fields",
      "request",
      "response",
      "banner",
      "badge",
      "tooltip",
      "prompt",
    ]);
    const frame = parsed.blocks.find((block) => block.type === "frame");
    expect(frame && frame.type === "frame" ? frame.src : null).toBe("https://example.com/shot.png");
  });
});

function page(slug: string): PlannedPage {
  return {
    slug,
    section: slug ? "How-to" : "Get Started",
    title: "Files",
    description: "",
    navOrder: 1,
    kind: slug ? "guide" : "home",
    layout: slug ? "how-to" : "overview",
    audience: "app",
    reader: "user",
    question: "What is this?",
    sourcePaths: [],
    routes: [],
  };
}

const emptyFacts = {
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
