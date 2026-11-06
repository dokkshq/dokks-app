import {
  createGithubAppJwt,
  githubApiHeaders,
  readGithubPrivateKey,
} from "@/lib/github/app";
import { githubApiError } from "@/lib/github/api-error";

export class GithubAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubAppConfigError";
  }
}

export async function createInstallationToken(args: {
  installationId: string;
  appId?: string;
  privateKey?: string;
  fetcher?: typeof fetch;
}): Promise<{ token: string; expiresAt: string }> {
  const appId = args.appId ?? process.env.GITHUB_APP_ID;
  const privateKey = readGithubPrivateKey(
    args.privateKey ?? process.env.GITHUB_APP_PRIVATE_KEY,
  );
  if (!appId || !privateKey) {
    throw new GithubAppConfigError(
      "GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required to read a repository.",
    );
  }
  const jwt = createGithubAppJwt(appId, privateKey);
  const fetcher = args.fetcher ?? fetch;
  const response = await fetcher(
    `https://api.github.com/app/installations/${encodeURIComponent(args.installationId)}/access_tokens`,
    {
      method: "POST",
      headers: githubApiHeaders(jwt),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw githubApiError("GitHub installation token request", response);
  }
  const body = (await response.json()) as { token?: unknown; expires_at?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    throw new Error("GitHub did not return an installation token.");
  }
  return {
    token: body.token,
    expiresAt:
      typeof body.expires_at === "string" ? body.expires_at : new Date(Date.now() + 3_600_000).toISOString(),
  };
}
