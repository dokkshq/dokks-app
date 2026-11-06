import { describe, expect, it } from "vitest";
import {
  GithubRateLimitError,
  githubApiError,
  isGithubRateLimitResponse,
} from "@/lib/github/api-error";

function response(status: number, headers: Record<string, string> = {}) {
  return new Response("{}", { status, headers });
}

describe("GitHub API errors", () => {
  it("recognizes primary rate limits", () => {
    const reset = Math.floor(Date.now() / 1_000) + 60;
    const limited = response(403, {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(reset),
    });
    expect(isGithubRateLimitResponse(limited)).toBe(true);
    const error = githubApiError("GitHub tree request", limited);
    expect(error).toBeInstanceOf(GithubRateLimitError);
    expect(error.message).toContain("rate limit");
    expect((error as GithubRateLimitError).retryAfterMs).toBeGreaterThan(0);
  });

  it("recognizes secondary rate limits from retry-after", () => {
    const limited = response(403, { "retry-after": "30" });
    expect(isGithubRateLimitResponse(limited)).toBe(true);
    expect((githubApiError("GitHub blob request", limited) as GithubRateLimitError).retryAfterMs).toBe(30_000);
  });

  it("recognizes 429 responses as rate limits", () => {
    expect(githubApiError("GitHub compare request", response(429))).toBeInstanceOf(
      GithubRateLimitError,
    );
  });

  it("keeps ordinary permission failures permanent", () => {
    const error = githubApiError("GitHub tree request", response(403));
    expect(error).not.toBeInstanceOf(GithubRateLimitError);
    expect(error.message).toBe("GitHub tree request failed (403).");
  });
});
