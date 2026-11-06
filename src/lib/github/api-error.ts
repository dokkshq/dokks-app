export class GithubRateLimitError extends Error {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "GithubRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isGithubRateLimitResponse(response: Response): boolean {
  return (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after")))
  );
}

export function githubApiError(action: string, response: Response): Error {
  if (!isGithubRateLimitResponse(response)) {
    return new Error(`${action} failed (${response.status}).`);
  }
  const waitMs = retryAfterMs(response);
  const wait = waitMs === undefined ? "" : ` Retry after ${Math.ceil(waitMs / 1_000)}s.`;
  return new GithubRateLimitError(
    `${action} failed (${response.status}). GitHub rate limit reached.${wait}`,
    waitMs,
  );
}

function retryAfterMs(response: Response): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1_000 - Date.now());
    }
  }
  return undefined;
}
