import { describe, expect, it, vi } from "vitest";
import {
  isRelevantPath,
  readRepoSnapshot,
  selectContentCandidates,
} from "@/lib/github/repo-content";

describe("repository content selection", () => {
  it("skips generated, dependency, binary, and secret paths", () => {
    expect(isRelevantPath("README.md")).toBe(true);
    expect(isRelevantPath("src/index.ts")).toBe(true);
    expect(isRelevantPath("node_modules/pkg/index.js")).toBe(false);
    expect(isRelevantPath("dist/index.js")).toBe(false);
    expect(isRelevantPath("package-lock.json")).toBe(false);
    expect(isRelevantPath("public/logo.png")).toBe(false);
    expect(isRelevantPath(".env")).toBe(false);
    expect(isRelevantPath(".env.example")).toBe(true);
  });

  it("reads the README before manifests and domain modules, ahead of docs", () => {
    const selected = selectContentCandidates([
      "src/z.ts",
      "package.json",
      "docs/setup.md",
      "README.md",
      "src/a.ts",
      "image.png",
    ]);
    expect(selected).toEqual([
      "README.md",
      "package.json",
      "src/a.ts",
      "src/z.ts",
      "docs/setup.md",
    ]);
  });

  it("surfaces rate limits during a branch lookup", async () => {
    const fetcher = vi.fn(async () => {
      return new Response("{}", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1_000) + 60),
        },
      });
    }) as unknown as typeof fetch;
    await expect(
      readRepoSnapshot({
        owner: "opentip",
        name: "app",
        branch: "main",
        token: "token",
        fetcher,
      }),
    ).rejects.toMatchObject({ name: "GithubRateLimitError" });
  });

  it("surfaces rate limits instead of silently dropping blob reads", async () => {
    const sha = "a".repeat(40);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/ref/heads/")) {
        return Response.json({ object: { sha } });
      }
      if (url.includes("/git/trees/")) {
        return Response.json({
          truncated: false,
          tree: [{ path: "package.json", type: "blob", sha }],
        });
      }
      if (url.includes("/git/blobs/")) {
        return new Response("{}", {
          status: 403,
          headers: { "retry-after": "30" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    await expect(
      readRepoSnapshot({
        owner: "opentip",
        name: "app",
        branch: "main",
        token: "token",
        fetcher,
      }),
    ).rejects.toMatchObject({ name: "GithubRateLimitError" });
  });
});
