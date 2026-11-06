import { createSign, randomBytes } from "node:crypto";
import { productName } from "@/lib/brand";
import { appUrl } from "@/lib/config";

export function readGithubPrivateKey(
  value: string | undefined = process.env.GITHUB_APP_PRIVATE_KEY,
): string | null {
  if (!value) return null;
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export function createGithubAppJwt(appId: string, privateKeyPem: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: appId,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKeyPem).toString("base64url")}`;
}

export function githubAuthorizeUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", `${appUrl()}/api/auth/github/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export function newOauthNonce(): string {
  return randomBytes(24).toString("hex");
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export type GithubUser = {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type GithubAuthorization = {
  accessToken: string;
  profile: GithubUser;
};

export async function exchangeGithubCode(code: string): Promise<GithubAuthorization> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${appUrl()}/api/auth/github/callback`,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error("GitHub token exchange failed");
  }
  const tokenJson = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    throw new Error(tokenJson.error || "GitHub token exchange failed");
  }
  const userResponse = await fetch("https://api.github.com/user", {
    headers: githubApiHeaders(tokenJson.access_token),
  });
  if (!userResponse.ok) throw new Error("GitHub user lookup failed");
  const user = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  let email = user.email;
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: githubApiHeaders(tokenJson.access_token),
    });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      email = emails.find((item) => item.primary && item.verified)?.email ?? null;
    }
  }
  return {
    accessToken: tokenJson.access_token,
    profile: {
      id: String(user.id),
      login: user.login,
      name: user.name,
      email,
      avatarUrl: user.avatar_url,
    },
  };
}

export function githubApiHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": productName(),
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
