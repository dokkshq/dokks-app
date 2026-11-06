import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/copilot/facts";
import { runChatPipeline, runFirstBuildPipeline } from "@/lib/copilot/pipeline";
import type { CompletionRequest, CopilotProvider } from "@/lib/copilot/providers";
import type { RepoSnapshot } from "@/lib/github/repo-content";

function provider(handler: (request: CompletionRequest) => string): CopilotProvider {
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
        estimatedCostUsd: 0.01,
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
});
