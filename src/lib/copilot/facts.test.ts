import { describe, expect, it } from "vitest";
import { extractFacts, inferAudience, normalizeRoutePath, routePathFromFile, routesMatch } from "@/lib/copilot/facts";
import { contentRank, selectContentCandidates } from "@/lib/github/repo-content";

const snapshot = {
  treePaths: [
    "README.md",
    "ROADMAP.md",
    ".github/workflows/ci.yml",
    "package.json",
    ".env.example",
    "prisma/schema.prisma",
    "src/app/api/providers/route.ts",
    "src/app/api/users/[id]/route.ts",
    "src/app/(marketing)/page.tsx",
    "docs/setup.md",
  ],
  files: [
    {
      path: "README.md",
      truncated: false,
      content: "# Plugr\n\nStudent marketplace.\n",
    },
    {
      path: "ROADMAP.md",
      truncated: false,
      content: "The discovery ranking will use a composite score and a 0-100 credibility score.\n",
    },
    {
      path: "package.json",
      truncated: false,
      content: JSON.stringify({
        name: "plugr",
        description: "Student marketplace",
        scripts: { dev: "next dev", test: "vitest", migrate: "prisma migrate deploy" },
      }),
    },
    {
      path: ".env.example",
      truncated: false,
      content: "DATABASE_URL=postgres://localhost/plugr\n# comment\nAUTH_SECRET=\n",
    },
    {
      path: "prisma/schema.prisma",
      truncated: false,
      content: "model User {\n  id String @id\n  email String\n}\n",
    },
    {
      path: "src/app/api/providers/route.ts",
      truncated: false,
      content: "export async function GET() { return Response.json({ ok: true }); }\nexport async function POST() { return Response.json({ ok: true }); }\n",
    },
    {
      path: "src/app/api/users/[id]/route.ts",
      truncated: false,
      content: "export function GET() { return new Response(process.env.DATABASE_URL ?? \"\"); }\n",
    },
    {
      path: "docs/setup.md",
      truncated: false,
      content: "Copy .env.example. The future composite score is not shipped.\n",
    },
  ],
};

describe("content ranking", () => {
  it("reads the README before manifests, and ranks domain modules with manifests ahead of routes", () => {
    const selected = selectContentCandidates([
      ".github/workflows/ci.yml",
      "ROADMAP.md",
      "src/app/api/users/route.ts",
      "README.md",
      "docs/guide.md",
      "package.json",
      "prisma/schema.prisma",
      "src/index.ts",
    ]);
    expect(selected.slice(0, 5)).toEqual([
      "README.md",
      "package.json",
      "prisma/schema.prisma",
      "src/index.ts",
      "src/app/api/users/route.ts",
    ]);
    expect(selected.indexOf("README.md")).toBeLessThan(selected.indexOf("package.json"));
    expect(selected.indexOf("package.json")).toBeLessThan(selected.indexOf("src/app/api/users/route.ts"));
    expect(contentRank("README.md")).toBeLessThan(contentRank("package.json"));
    expect(contentRank("package.json")).toBe(contentRank("src/lib/search.ts"));
    expect(contentRank("package.json")).toBeLessThan(contentRank("src/app/api/health/route.ts"));
    expect(contentRank("README.md")).toBeLessThan(contentRank("ROADMAP.md"));
  });
});

describe("fact extraction", () => {
  it("pulls routes, env vars, scripts, and schema from code, not the roadmap", () => {
    const facts = extractFacts(snapshot);
    expect(facts.audience).toBe("app");
    expect(facts.packageName).toBe("plugr");
    expect(facts.scripts.map((script) => script.name)).toEqual(["dev", "test", "migrate"]);
    expect(facts.envVars.map((item) => item.name).sort()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
    expect(facts.schemaModels).toEqual([
      { name: "User", fields: ["id", "email"], source: "prisma/schema.prisma" },
    ]);
    expect(facts.routes).toEqual(
      expect.arrayContaining([
        { method: "GET", path: "/api/providers", source: "src/app/api/providers/route.ts" },
        { method: "POST", path: "/api/providers", source: "src/app/api/providers/route.ts" },
        { method: "GET", path: "/api/users/:id", source: "src/app/api/users/[id]/route.ts" },
      ]),
    );
    expect(JSON.stringify(facts.routes)).not.toContain("composite");
    expect(facts.readmeExcerpt).toContain("Student marketplace");
  });

  it("normalizes Next route files and dynamic segments", () => {
    expect(routePathFromFile("src/app/api/users/[id]/route.ts")).toBe("/api/users/:id");
    expect(routePathFromFile("app/(app)/api/health/route.ts")).toBe("/api/health");
    expect(routePathFromFile("pages/api/auth/[...nextauth].ts")).toBe("/api/auth/:nextauth*");
    expect(routesMatch("/api/users/:id", "/api/users/[id]")).toBe(true);
    expect(normalizeRoutePath("/api/users/:userId")).toBe("/api/users/:param");
  });

  it("treats a package with a bin as a CLI and a main export as a library", () => {
    expect(
      inferAudience(
        { binaries: ["bin/cli.js"], routes: [], packageMain: null, scripts: [], entryPoints: [] },
        [],
      ),
    ).toBe("cli");
    expect(
      inferAudience(
        { binaries: [], routes: [], packageMain: "dist/index.js", scripts: [], entryPoints: [] },
        ["src/index.ts"],
      ),
    ).toBe("library");
  });
});
