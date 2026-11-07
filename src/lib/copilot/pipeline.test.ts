import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/copilot/facts";
import { runChatPipeline, runFirstBuildPipeline, runPushPipeline } from "@/lib/copilot/pipeline";
import type { PlannedPage } from "@/lib/copilot/page-plan";
import type { CompletionRequest, CopilotProvider } from "@/lib/copilot/providers";
import type { RepoSnapshot } from "@/lib/github/repo-content";
import { WRITER_FILE_CHARS, WRITER_SOURCE_CHARS } from "@/lib/copilot/limits";

function provider(
  handler: (request: CompletionRequest) => string,
  cost: number | ((request: CompletionRequest) => number) = 0.01,
): CopilotProvider {
  return {
    id: "fake",
    model: "test-model",
    task: "heavy",
    async complete(request) {
      const text = handler(request);
      return {
        text,
        provider: "fake",
        model: "test-model",
        promptTokens: 20,
        completionTokens: 10,
        estimatedCostUsd: typeof cost === "function" ? cost(request) : cost,
      };
    },
  };
}

const snapshot: RepoSnapshot = {
  sha: "a".repeat(40),
  branch: "main",
  treePaths: ["package.json", "README.md", ".env.example", "src/app/api/providers/route.ts"],
  omittedFiles: 0,
  treeTruncated: false,
  files: [
    {
      path: "package.json",
      truncated: false,
      content: JSON.stringify({ name: "plugr", description: "Student marketplace", scripts: { dev: "next dev" } }),
    },
    { path: "README.md", truncated: false, content: "# Plugr\n\nStudents find gigs.\n" },
    { path: ".env.example", truncated: false, content: "DATABASE_URL=postgres://localhost/plugr\n" },
    {
      path: "src/app/api/providers/route.ts",
      truncated: false,
      content: "export function GET() { return Response.json({ ok: true }); }\n",
    },
  ],
};

describe("docs pipeline", () => {
  it("waits for plan approval, then drops a page that still invents a route", async () => {
    const facts = extractFacts(snapshot);
    const model = provider((request) => {
      if (request.system.includes("DOCS_STAGE:model")) {
        return JSON.stringify({ promise: "Student marketplace", jobs: [], nouns: [] });
      }
      if (request.system.includes("DOCS_STAGE:critique")) {
        return JSON.stringify({ pass: true, reasons: [] });
      }
      if (request.system.includes("DOCS_STAGE:plan")) {
        return JSON.stringify({ pages: [] });
      }
      if (request.system.includes("DOCS_STAGE:rewrite")) {
        return JSON.stringify({
          title: "API reference",
          description: "Routes",
          content: "Call `POST /api/score` to rank providers.",
        });
      }
      if (request.user.includes("Slug: api-reference")) {
        return JSON.stringify({
          title: "API reference",
          description: "Routes",
          content: "See [scores](/composite-score).\n\nCall `POST /api/score`.",
        });
      }
      if (request.user.includes("Slug: getting-started")) {
        return JSON.stringify({
          title: "Getting started",
          description: "Run it",
          content: "Run `npm install`, then `npm run dev`. Set `process.env.DATABASE_URL` before the server starts so the app can reach its database.",
        });
      }
      return JSON.stringify({
        title: "",
        description: "Student marketplace",
        content: "Read the [API reference](/api-reference) and the [missing guide](/not-a-page).",
      });
    });
    const planned = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
    });
    expect(planned.awaitingApproval).toBe(true);
    expect(planned.pages).toEqual([]);
    expect(planned.plan.map((page) => page.slug)).toEqual(
      expect.arrayContaining(["", "getting-started", "configuration", "api-reference"]),
    );
    const result = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
      approvedPlan: planned.plan,
    });
    const api = result.pages.find((page) => page.slug === "api-reference");
    const home = result.pages.find((page) => page.slug === "");
    expect(api).toBeUndefined();
    expect(result.verification.find((item) => item.slug === "api-reference")?.stubbed).toBe(false);
    expect(result.verification.find((item) => item.slug === "api-reference")?.dropped).toBe(true);
    expect(home?.content).not.toContain("](/not-a-page)");
    expect(result.pages.map((page) => page.slug)).toEqual(expect.arrayContaining(["", "getting-started"]));
    expect(result.awaitingApproval).toBe(false);
    expect(planned.usage.stages.map((stage) => stage.stage)).toContain("model");
  });

  it("starts the write run from planning spend instead of zero", async () => {
    const facts = extractFacts(snapshot);
    const model = provider((request) => {
      if (request.system.includes("DOCS_STAGE:model")) {
        return JSON.stringify({ promise: "Student marketplace", jobs: [], nouns: [] });
      }
      if (request.system.includes("DOCS_STAGE:plan") || request.system.includes("DOCS_STAGE:critique")) {
        return JSON.stringify({ pages: [], pass: true, reasons: [] });
      }
      return JSON.stringify({
        title: "Plugr",
        description: "Students find gigs.",
        content: "Students find gigs by posting a short description and waiting for a match from the marketplace.",
      });
    }, 3);
    const planned = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
    });
    expect(planned.awaitingApproval).toBe(true);
    expect(planned.usage.estimatedCostUsd).toBeGreaterThanOrEqual(6);
    const carried = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
      approvedPlan: planned.plan,
      alreadySpentUsd: planned.usage.estimatedCostUsd,
    });
    expect(carried.pages).toEqual([]);
    expect(carried.usage.estimatedCostUsd).toBe(planned.usage.estimatedCostUsd);
    expect(carried.verification.length).toBe(planned.plan.length);
    expect(carried.verification.every((item) => item.unwritten === true && item.stubbed === false)).toBe(true);
    const fromZero = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
      approvedPlan: planned.plan.slice(0, 1),
    });
    expect(fromZero.verification.some((item) => item.unwritten)).toBe(false);
  });

  it("leaves a page unwritten when the writer reply cannot be parsed", async () => {
    const facts = extractFacts(snapshot);
    const model = provider((request) => {
      if (request.system.includes("DOCS_STAGE:model")) {
        return JSON.stringify({ promise: "Student marketplace", jobs: [], nouns: [] });
      }
      if (request.system.includes("DOCS_STAGE:plan")) return JSON.stringify({ pages: [] });
      if (request.system.includes("DOCS_STAGE:write")) return "not json";
      return "nope";
    });
    const planned = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
    });
    const result = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
      approvedPlan: planned.plan,
    });
    expect(result.pages).toEqual([]);
    expect(result.verification.length).toBeGreaterThan(0);
    expect(result.verification.every((item) => item.unwritten === true && item.stubbed === false && item.dropped !== true)).toBe(true);
    expect(JSON.stringify(result.pages)).not.toContain("git clone");
    expect(JSON.stringify(result.pages)).not.toContain("npm install");
  });

  it("stops at the cost ceiling and leaves the remaining pages unwritten", async () => {
    const facts = extractFacts(snapshot);
    const model = provider(() => {
      return JSON.stringify({
        title: "Plugr",
        description: "Student marketplace",
        content: "Students find gigs by posting a short description and waiting for a match.",
      });
    });
    const planned = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
    });
    const blocked = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot,
      facts,
      approvedPlan: planned.plan,
      alreadySpentUsd: 6,
    });
    expect(blocked.pages).toEqual([]);
    expect(blocked.verification.length).toBeGreaterThan(0);
    expect(blocked.verification.every((item) => item.stubbed === false && item.unwritten === true)).toBe(true);
  });

  it("plans a chat edit across more than one page", async () => {
    const facts = extractFacts(snapshot);
    const model = provider((request) => {
      if (request.system.includes("DOCS_STAGE:chat-plan")) {
        return JSON.stringify({ slugs: ["", "getting-started"], note: "Both mention setup." });
      }
      return JSON.stringify({
        title: request.user.includes("Getting started") ? "Getting started" : "Plugr",
        description: "Updated",
        content: "Run `npm install`, then `npm run dev`. The health route is `GET /api/providers`. Use the database URL from the environment example.",
      });
    });
    const gated = await runChatPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      facts,
      files: snapshot.files,
      treePaths: snapshot.treePaths,
      focusSlug: "",
      instruction: "Mention the dev script on the home page and the getting started page.",
      pages: [
        {
          slug: "",
          section: "Get Started",
          title: "Plugr",
          description: null,
          navOrder: 0,
          content: "Welcome\n\n<!-- sources: README.md -->",
        },
        {
          slug: "getting-started",
          section: "Get Started",
          title: "Getting started",
          description: null,
          navOrder: 10,
          content: "Install\n\n<!-- sources: package.json -->",
        },
      ],
    });
    expect(gated.pages).toEqual([]);
    expect(gated.awaitingApproval).toBe(true);
    const result = await runChatPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      facts,
      files: snapshot.files,
      treePaths: snapshot.treePaths,
      focusSlug: "",
      instruction: "Mention the dev script on the home page and the getting started page.",
      approvedPlan: gated.plan,
      pages: [
        {
          slug: "",
          section: "Introduction",
          title: "Plugr",
          description: null,
          navOrder: 0,
          content: "Welcome\n\n<!-- sources: README.md -->",
        },
        {
          slug: "getting-started",
          section: "Guides",
          title: "Getting started",
          description: null,
          navOrder: 10,
          content: "Install\n\n<!-- sources: package.json -->",
        },
        {
          slug: "api-reference",
          section: "Reference",
          title: "API reference",
          description: null,
          navOrder: 40,
          content: "Routes\n\n<!-- sources: src/app/api/providers/route.ts -->",
        },
      ],
    });
    expect(result.pages.map((page) => page.slug).sort()).toEqual(["", "getting-started"]);
    expect(result.pages.every((page) => page.content.includes("npm run dev"))).toBe(true);
  });

  it("gives an added outline page real sources inside the writer budgets", async () => {
    const files = [
      { path: "README.md", truncated: false, content: "# Plugr\n\nStudents find gigs.\n" },
      { path: "package.json", truncated: false, content: JSON.stringify({ name: "plugr", description: "Student marketplace" }) },
      { path: "src/app/billing/page.tsx", truncated: false, content: "Z".repeat(WRITER_FILE_CHARS + 6_000) },
      { path: "src/billing/extra.ts", truncated: false, content: "Z".repeat(100) },
    ];
    const rich: RepoSnapshot = {
      ...snapshot,
      treePaths: files.map((file) => file.path),
      files,
    };
    const facts = extractFacts(rich);
    let seen = "";
    const model = provider((request) => {
      if (request.system.includes("DOCS_STAGE:write") && request.user.includes("Slug: billing")) seen = request.user;
      return JSON.stringify({
        title: "Billing",
        description: "How do I pay?",
        content: "Open billing, choose a plan, and confirm payment before the gig is posted. The charge uses the plan selected on that screen.",
      });
    });
    const result = await runFirstBuildPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      snapshot: rich,
      facts,
      approvedPlan: [outlinePage("billing", "Billing", "How do I pay?")],
    });
    const page = result.plan.find((item) => item.slug === "billing");
    expect(page?.sourcePaths).toContain("src/app/billing/page.tsx");
    expect(page?.sourcePaths.length).toBeGreaterThan(0);
    expect(page?.sourcePaths.length).toBeLessThanOrEqual(20);
    expect(seen).toContain("--- src/app/billing/page.tsx");
    const runs = seen.match(/Z{1000,}/g) ?? [];
    expect(runs.length).toBeGreaterThan(0);
    expect(Math.max(...runs.map((run) => run.length))).toBeLessThanOrEqual(WRITER_FILE_CHARS);
    expect(runs.reduce((total, run) => total + run.length, 0)).toBeLessThanOrEqual(WRITER_SOURCE_CHARS);
    expect(result.pages.find((item) => item.slug === "billing")?.content).toContain("src/app/billing/page.tsx");
  });

  it("maps a leftover Guides section and a missing section onto a plan section", async () => {
    const facts = extractFacts(snapshot);
    const model = provider(() =>
      JSON.stringify({
        title: "Install",
        description: "Install the app",
        content: "Run `npm install`, then `npm run dev`. The health route is `GET /api/providers`.",
      }),
    );
    const result = await runPushPipeline({
      heavy: model,
      small: model,
      siteName: "Plugr",
      repoFullName: "optimusexe/Plugr",
      facts,
      files: snapshot.files,
      treePaths: snapshot.treePaths,
      changedPaths: ["README.md", "package.json"],
      removedPaths: [],
      existingPages: [
        {
          slug: "install",
          section: "Guides",
          title: "Install",
          description: "Install it",
          navOrder: 10,
          content: "Install\n\n<!-- sources: README.md -->",
        },
        {
          slug: "setup",
          section: null,
          title: "Setup",
          description: "Set it up",
          navOrder: 11,
          content: "Setup\n\n<!-- sources: package.json -->",
        },
      ],
    });
    expect(result.plan.find((page) => page.slug === "install")?.section).toBe("How-to");
    expect(result.plan.find((page) => page.slug === "setup")?.section).toBe("How-to");
    expect(result.plan.every((page) => ["Get Started", "Concepts", "How-to", "Reference"].includes(page.section))).toBe(true);
  });
});

function outlinePage(slug: string, title: string, question: string): PlannedPage {
  return {
    slug,
    section: "How-to",
    title,
    description: question,
    navOrder: 20,
    kind: "guide",
    layout: "how-to",
    audience: "app",
    reader: "user",
    question,
    sourcePaths: [],
    routes: [],
  };
}
