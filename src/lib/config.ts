type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function appUrl(env: Env = process.env): string {
  return required(env, "APP_URL").replace(/\/$/, "");
}

export function docsRootDomain(env: Env = process.env): string {
  return required(env, "DOCS_ROOT_DOMAIN").toLowerCase();
}

export function appHosts(env: Env = process.env): string[] {
  let fromApp: string;
  try {
    fromApp = new URL(appUrl(env)).host.toLowerCase();
  } catch (error) {
    if (error instanceof TypeError) throw new Error("APP_URL must be an absolute URL");
    throw error;
  }
  const extra = (env.APP_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hosts = [fromApp, ...extra];
  if (env.NODE_ENV !== "production") {
    hosts.push("localhost", "127.0.0.1");
  }
  return Array.from(new Set(hosts));
}

export function sessionSecret(env: Env = process.env): string | null {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.NODE_ENV !== "production") return "dev-session-secret";
  return null;
}

export function ogSecret(env: Env = process.env): string | null {
  if (env.OG_SIGNING_SECRET) return env.OG_SIGNING_SECRET;
  if (env.NODE_ENV !== "production") return "dev-og-secret";
  return null;
}

export function showPlanPrices(env: Env = process.env): boolean {
  return env.SHOW_PLAN_PRICES === "1";
}

export function githubAppSlug(env: Env = process.env): string {
  return required(env, "GITHUB_APP_SLUG").toLowerCase();
}

export function githubAppInstallUrl(env: Env = process.env): string {
  return `https://github.com/apps/${githubAppSlug(env)}/installations/new`;
}

export function socialXUrl(env: Env = process.env): string | null {
  const value = env.SOCIAL_X_URL?.trim();
  return value || null;
}

export function socialGithubUrl(env: Env = process.env): string | null {
  const value = env.SOCIAL_GITHUB_URL?.trim();
  return value || null;
}
