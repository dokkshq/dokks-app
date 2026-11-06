import { describe, expect, it } from "vitest";
import { appHosts, appUrl, docsRootDomain, githubAppInstallUrl, githubAppSlug } from "@/lib/config";

describe("public config", () => {
  it("requires the GitHub app slug", () => {
    expect(() => githubAppSlug({})).toThrow(/GITHUB_APP_SLUG is required/);
  });

  it("uses GITHUB_APP_SLUG when set", () => {
    expect(githubAppSlug({ GITHUB_APP_SLUG: "Custom-Slug" })).toBe("custom-slug");
    expect(githubAppInstallUrl({ GITHUB_APP_SLUG: "custom-slug" })).toBe(
      "https://github.com/apps/custom-slug/installations/new",
    );
  });

  it("reads the app and docs hosts from env", () => {
    const env = {
      APP_URL: "https://beta.example.com",
      DOCS_ROOT_DOMAIN: "Docs.Example",
      NODE_ENV: "production",
    };
    expect(appUrl(env)).toBe("https://beta.example.com");
    expect(docsRootDomain(env)).toBe("docs.example");
    expect(appHosts(env)).toEqual(["beta.example.com"]);
  });

  it("adds local hosts outside production", () => {
    expect(
      appHosts({
        APP_URL: "https://beta.example.com",
        NODE_ENV: "development",
      }),
    ).toEqual(["beta.example.com", "localhost", "127.0.0.1"]);
  });
});
