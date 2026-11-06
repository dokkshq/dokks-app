import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/copilot/facts";
import { factualPageContent, mergePagePlan, planPagesFromFacts, productCritique } from "@/lib/copilot/page-plan";
import { buildProductModel } from "@/lib/copilot/product-model";
import { extractProductSurface } from "@/lib/copilot/product-surface";

const treePaths = [
  "README.md",
  "package.json",
  ".env.example",
  "prisma/schema.prisma",
  "src/app/api/providers/route.ts",
  "src/app/api/users/[id]/route.ts",
  "src/app/api/gigs/route.ts",
  "src/app/api/gigs/[id]/route.ts",
  "src/app/api/orders/route.ts",
  "src/app/api/orders/[id]/route.ts",
  "src/app/api/reviews/route.ts",
  "src/app/api/messages/route.ts",
  "src/app/api/search/route.ts",
  "src/app/api/health/route.ts",
];

function routeFile(path: string, methods = "GET") {
  return {
    path,
    truncated: false,
    content: methods
      .split(",")
      .map((method) => `export function ${method}() { return new Response(""); }`)
      .join("\n"),
  };
}

describe("page plan", () => {
  it("separates a user guide from an API reference built from real routes", () => {
    const facts = extractFacts({
      treePaths,
      files: [
        { path: "README.md", truncated: false, content: "# Plugr\n\nMarketplace." },
        {
          path: "package.json",
          truncated: false,
          content: JSON.stringify({ name: "plugr", scripts: { dev: "next dev" } }),
        },
        { path: ".env.example", truncated: false, content: "DATABASE_URL=\n" },
        ...treePaths.filter((path) => path.includes("/api/")).map((path) => routeFile(path)),
      ],
    });
    const plan = planPagesFromFacts({ facts, treePaths });
    const slugs = plan.map((page) => page.slug);
    expect(slugs).toContain("");
    expect(slugs).toContain("getting-started");
    expect(slugs).toContain("configuration");
    expect(slugs).toContain("api-reference");
    expect(plan.find((page) => page.slug === "api-reference")?.section).toBe("Reference");
    expect(plan.find((page) => page.slug === "getting-started")?.section).toBe("Get Started");
    expect(plan.find((page) => page.slug === "getting-started")?.layout).toBe("get-started");
    const api = plan.filter((page) => page.kind === "api");
    const documented = api.flatMap((page) => page.routes.map((route) => route.path));
    expect(documented).toEqual(expect.arrayContaining(facts.routes.map((route) => route.path)));
    expect(plan.every((page) => page.slug !== "api")).toBe(true);
  });

  it("keeps deterministic API pages when the model suggests an extra guide", () => {
    const facts = extractFacts({
      treePaths: ["package.json", "src/app/api/health/route.ts"],
      files: [
        { path: "package.json", truncated: false, content: JSON.stringify({ name: "plugr", scripts: { dev: "next dev" } }) },
        routeFile("src/app/api/health/route.ts"),
      ],
    });
    const base = planPagesFromFacts({
      facts,
      treePaths: ["package.json", "src/app/api/health/route.ts", "src/lib/search.ts"],
    });
    const merged = mergePagePlan({
      base,
      facts,
      treePaths: ["package.json", "src/app/api/health/route.ts", "src/lib/search.ts"],
      suggested: [
        {
          slug: "search",
          title: "Search",
          description: "How search works.",
          kind: "guide",
          sourcePaths: ["src/lib/search.ts", "does-not-exist.ts"],
        },
      ],
    });
    expect(merged.some((page) => page.slug === "api-reference")).toBe(true);
    const search = merged.find((page) => page.slug === "search");
    expect(search?.sourcePaths).toEqual(["src/lib/search.ts"]);
  });

  it("writes a getting started page from scripts and env facts", () => {
    const facts = extractFacts({
      treePaths: ["README.md", "package.json", ".env.example"],
      files: [
        { path: "README.md", truncated: false, content: "# Plugr" },
        {
          path: "package.json",
          truncated: false,
          content: JSON.stringify({ name: "plugr", scripts: { dev: "next dev", migrate: "prisma migrate deploy" } }),
        },
        { path: ".env.example", truncated: false, content: "DATABASE_URL=\n" },
      ],
    });
    const plan = planPagesFromFacts({ facts, treePaths: ["README.md", "package.json", ".env.example"] });
    const page = plan.find((item) => item.slug === "getting-started");
    expect(page).toBeTruthy();
    const body = factualPageContent(page!, facts, "optimusexe/Plugr");
    expect(body.content).toContain("git clone https://github.com/optimusexe/Plugr.git");
    expect(body.content).toContain("npm install");
    expect(body.content).toContain("DATABASE_URL");
    expect(body.content).toContain("npm run dev");
    expect(body.content).toContain("<!-- sources:");
  });

  it("plans a hosted app around screens and does not dump internal routes", () => {
    const treePaths = ["package.json", "README.md", "src/app/gigs/page.tsx", "src/app/api/gigs/route.ts"];
    const files = [
      { path: "package.json", truncated: false, content: JSON.stringify({ name: "plugr", description: "Students find gigs." }) },
      { path: "README.md", truncated: false, content: "# Plugr\n\nStudents find gigs.\n" },
      {
        path: "src/app/gigs/page.tsx",
        truncated: false,
        content: "<h1>Find a gig</h1><Button>Post a gig</Button>",
      },
      routeFile("src/app/api/gigs/route.ts", "POST"),
    ];
    const facts = extractFacts({ treePaths, files });
    const surface = extractProductSurface({ treePaths, files }, facts);
    const model = buildProductModel(surface, facts);
    const plan = planPagesFromFacts({ facts, treePaths, files, model });
    expect(surface.kind).toBe("hosted-app");
    expect(model.reader).toBe("user");
    expect(plan.map((page) => page.slug)).toEqual(["", "getting-started"]);
    expect(plan.some((page) => page.slug === "find-a-gig")).toBe(false);
    expect(plan.some((page) => page.slug.startsWith("api-reference"))).toBe(false);
    const guide = plan.find((page) => page.slug === "getting-started");
    expect(guide?.reader).toBe("user");
    expect(guide?.layout).toBe("get-started");
    expect(factualPageContent(guide!, facts, "ada/plugr").content).not.toContain("git clone");
    expect(productCritique("Clone it.\n\n```bash\ngit clone https://github.com/ada/plugr.git\n```", guide!, model)).toContain(
      "Tells a product user to clone the repository.",
    );
  });
});
