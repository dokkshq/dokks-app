import { MAX_FILE_CHARS } from "@/lib/copilot/limits";
import type { RepoFile, RepoSnapshot } from "@/lib/github/repo-content";
import { isRouteFile } from "@/lib/github/repo-content";

export type HttpRoute = {
  method: string;
  path: string;
  source: string;
};

export type EnvVarFact = {
  name: string;
  source: string;
  example: string | null;
};

export type ScriptFact = {
  name: string;
  command: string;
};

export type SchemaModel = {
  name: string;
  fields: string[];
  source: string;
};

export type Audience = "library" | "app" | "cli";

export type RepoFacts = {
  audience: Audience;
  packageName: string | null;
  packageDescription: string | null;
  packageMain: string | null;
  binaries: string[];
  routes: HttpRoute[];
  envVars: EnvVarFact[];
  scripts: ScriptFact[];
  schemaModels: SchemaModel[];
  entryPoints: string[];
  readmePath: string | null;
  readmeExcerpt: string;
};

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|prisma|toml|json|yml|yaml|env|example)$/i;

export function extractFacts(snapshot: Pick<RepoSnapshot, "files" | "treePaths">): RepoFacts {
  const files = snapshot.files;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const packageFile = files.find((file) => file.path.split("/").pop() === "package.json" && file.path.split("/").length <= 2);
  const pkg = packageFile ? readPackage(packageFile.content) : null;
  const routes = extractRoutes(snapshot.treePaths, byPath);
  const envVars = extractEnvVars(files);
  const schemaModels = extractSchema(files);
  const entryPoints = snapshot.treePaths.filter((path) => isEntryPointPath(path)).slice(0, 40);
  const readme = files.find((file) => /^readme(?:\.[a-z0-9]+)?$/i.test(file.path.split("/").pop() ?? "") && !file.path.includes("/"))
    ?? files.find((file) => /^readme(?:\.[a-z0-9]+)?$/i.test(file.path.split("/").pop() ?? ""));
  const binaries = pkg?.binaries ?? [];
  const facts: RepoFacts = {
    audience: "app",
    packageName: pkg?.name ?? null,
    packageDescription: pkg?.description ?? null,
    packageMain: pkg?.main ?? null,
    binaries,
    routes,
    envVars,
    scripts: pkg?.scripts ?? [],
    schemaModels,
    entryPoints,
    readmePath: readme?.path ?? null,
    readmeExcerpt: readme ? readme.content.slice(0, MAX_FILE_CHARS) : "",
  };
  facts.audience = inferAudience(facts, snapshot.treePaths);
  return facts;
}

export function inferAudience(facts: Pick<RepoFacts, "binaries" | "routes" | "packageMain" | "scripts" | "entryPoints">, treePaths: string[]): Audience {
  if (facts.binaries.length > 0) return "cli";
  if (facts.entryPoints.some((path) => /(?:^|\/)(?:bin|cmd|cli)\//i.test(path))) return "cli";
  if (facts.scripts.some((script) => /^(?:cli|start)$/.test(script.name) && /\b(?:commander|yargs|cac|meow)\b/.test(script.command))) {
    return "cli";
  }
  if (facts.routes.length > 0) return "app";
  if (treePaths.some((path) => /(?:^|\/)(?:app|pages)\//.test(path) || /next\.config\./.test(path))) {
    return "app";
  }
  if (facts.packageMain) return "library";
  return "library";
}

export function routePathFromFile(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const app = normalized.match(/(?:^|\/)app\/(.+)\/route\.(?:ts|tsx|js|jsx|mjs|cjs)$/i);
  if (app) {
    const parts = app[1]
      .split("/")
      .map(appSegment)
      .filter((part) => part !== "");
    return `/${parts.join("/")}`.replace(/\/+/g, "/") || "/";
  }
  const pages = normalized.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx|mjs)$/i);
  if (pages && !pages[1].endsWith(".test") && !pages[1].endsWith(".spec")) {
    const rest = pages[1].replace(/\/index$/, "");
    const parts = rest.split("/").map(appSegment).filter(Boolean);
    return `/api/${parts.join("/")}`.replace(/\/+/g, "/");
  }
  return null;
}

export function normalizeRoutePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, ":optional")
    .replace(/\[\.\.\.[^\]]+\]/g, ":rest")
    .replace(/\[[^\]]+\]/g, ":param")
    .replace(/:[A-Za-z_][\w]*\*/g, ":rest")
    .replace(/:[A-Za-z_][\w]*\?/g, ":optional")
    .replace(/:[A-Za-z_][\w]*/g, ":param")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

export function routesMatch(known: string, mentioned: string): boolean {
  return normalizeRoutePath(known) === normalizeRoutePath(mentioned);
}

function appSegment(part: string): string {
  if (part.startsWith("(") && part.endsWith(")")) return "";
  if (part.startsWith("@")) return "";
  const optional = part.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optional) return `:${optional[1]}?`;
  const rest = part.match(/^\[\.\.\.(.+)\]$/);
  if (rest) return `:${rest[1]}*`;
  const dynamic = part.match(/^\[(.+)\]$/);
  if (dynamic) return `:${dynamic[1]}`;
  return part;
}

function extractRoutes(treePaths: string[], byPath: Map<string, RepoFile>): HttpRoute[] {
  const routes: HttpRoute[] = [];
  const seen = new Set<string>();
  for (const path of treePaths) {
    if (!isRouteFile(path)) continue;
    const urlPath = routePathFromFile(path);
    if (!urlPath) continue;
    const file = byPath.get(path);
    const methods = file ? methodsIn(file.content) : [];
    const listed = methods.length > 0 ? methods : ["ANY"];
    for (const method of listed) {
      const key = `${method} ${urlPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ method, path: urlPath, source: path });
      if (routes.length >= 200) return routes;
    }
  }
  for (const file of byPath.values()) {
    if (isRouteFile(file.path) || !SOURCE_EXT.test(file.path)) continue;
    if (/\.(?:md|mdx)$/i.test(file.path)) continue;
    for (const match of file.content.matchAll(
      /(?:app|router)\.(get|post|put|patch|delete|head|options|all)\(\s*['"`](\/[^'"`\s]+)['"`]/gi,
    )) {
      const method = match[1].toUpperCase() === "ALL" ? "ANY" : match[1].toUpperCase();
      const key = `${method} ${match[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push({ method, path: match[2], source: file.path });
      if (routes.length >= 200) return routes;
    }
  }
  return routes;
}

function methodsIn(content: string): string[] {
  const found: string[] = [];
  for (const method of HTTP_METHODS) {
    const named = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    const constant = new RegExp(`export\\s+(?:const|let)\\s+${method}\\s*=`);
    if (named.test(content) || constant.test(content)) found.push(method);
  }
  return found;
}

function extractEnvVars(files: RepoFile[]): EnvVarFact[] {
  const map = new Map<string, EnvVarFact>();
  for (const file of files) {
    const name = file.path.split("/").pop() ?? "";
    if (name === ".env.example" || name.endsWith(".env.example")) {
      for (const row of envExample(file.content)) {
        const current = map.get(row.name);
        map.set(row.name, {
          name: row.name,
          source: file.path,
          example: row.example ?? current?.example ?? null,
        });
      }
    }
  }
  for (const file of files) {
    if (/\.(?:md|mdx)$/i.test(file.path)) continue;
    const patterns = [
      /process\.env\.([A-Z][A-Z0-9_]{1,80})/g,
      /process\.env\[\s*['"]([A-Z][A-Z0-9_]{1,80})['"]\s*\]/g,
      /os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{1,80})['"]/g,
      /os\.Getenv\(\s*"([A-Z][A-Z0-9_]{1,80})"\s*\)/g,
    ];
    for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        const envName = match[1];
        if (!envName || map.has(envName)) continue;
        map.set(envName, { name: envName, source: file.path, example: null });
        if (map.size >= 80) return [...map.values()];
      }
    }
  }
  return [...map.values()];
}

function envExample(content: string): Array<{ name: string; example: string | null }> {
  const rows: Array<{ name: string; example: string | null }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]{1,80})=(.*)$/);
    if (!match) continue;
    rows.push({ name: match[1], example: match[2] || null });
  }
  return rows;
}

function extractSchema(files: RepoFile[]): SchemaModel[] {
  const models: SchemaModel[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".prisma") && !/schema\.prisma$/.test(file.path)) continue;
    for (const match of file.content.matchAll(/model\s+([A-Za-z_][\w]*)\s*\{([^}]*)\}/g)) {
      const fields = match[2]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@") && !line.startsWith("///"))
        .map((line) => line.split(/\s+/)[0] ?? "")
        .filter((name) => /^[A-Za-z_]/.test(name))
        .slice(0, 40);
      models.push({ name: match[1], fields, source: file.path });
      if (models.length >= 40) return models;
    }
  }
  return models;
}

function readPackage(content: string): {
  name: string | null;
  description: string | null;
  main: string | null;
  scripts: ScriptFact[];
  binaries: string[];
} | null {
  try {
    const parsed = JSON.parse(content) as {
      name?: unknown;
      description?: unknown;
      main?: unknown;
      scripts?: unknown;
      bin?: unknown;
    };
    const scripts: ScriptFact[] = [];
    if (parsed.scripts && typeof parsed.scripts === "object") {
      for (const [name, command] of Object.entries(parsed.scripts as Record<string, unknown>)) {
        if (typeof command !== "string") continue;
        scripts.push({ name, command: command.slice(0, 240) });
        if (scripts.length >= 40) break;
      }
    }
    const binaries: string[] = [];
    if (typeof parsed.bin === "string") binaries.push(parsed.bin);
    if (parsed.bin && typeof parsed.bin === "object") {
      for (const value of Object.values(parsed.bin as Record<string, unknown>)) {
        if (typeof value === "string") binaries.push(value);
      }
    }
    return {
      name: typeof parsed.name === "string" ? parsed.name : null,
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 280) : null,
      main: typeof parsed.main === "string" ? parsed.main : null,
      scripts,
      binaries,
    };
  } catch {
    return null;
  }
}

function isEntryPointPath(path: string): boolean {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() ?? "";
  if (/(?:^|\/)(?:bin|cmd|cli)\//.test(lower)) return true;
  return /^(?:index|main|cli|server)\.(?:ts|tsx|js|jsx|py|go|rs)$/.test(name);
}

export function knownEnvNames(facts: Pick<RepoFacts, "envVars">): Set<string> {
  return new Set(facts.envVars.map((item) => item.name));
}

export function knownScriptNames(facts: Pick<RepoFacts, "scripts">): Set<string> {
  return new Set(facts.scripts.map((item) => item.name));
}

export function factsDigest(facts: RepoFacts, repoFullName: string | null): string {
  const lines = [
    `Audience: ${facts.audience}`,
    repoFullName ? `Repository: ${repoFullName}` : "",
    facts.packageName ? `Package: ${facts.packageName}` : "",
    facts.packageDescription ? `Description: ${facts.packageDescription}` : "",
    facts.packageMain ? `Main: ${facts.packageMain}` : "",
    facts.binaries.length ? `Binaries: ${facts.binaries.join(", ")}` : "",
    "",
    "Scripts:",
    facts.scripts.length
      ? facts.scripts.map((script) => `- ${script.name}: ${script.command}`).join("\n")
      : "(none)",
    "",
    "Environment variables:",
    facts.envVars.length
      ? facts.envVars.map((item) => `- ${item.name} (${item.source})`).join("\n")
      : "(none)",
    "",
    "HTTP routes:",
    facts.routes.length
      ? facts.routes.map((route) => `- ${route.method} ${route.path} (${route.source})`).join("\n")
      : "(none)",
    "",
    "Schema models:",
    facts.schemaModels.length
      ? facts.schemaModels
          .map((model) => `- ${model.name}: ${model.fields.slice(0, 12).join(", ")} (${model.source})`)
          .join("\n")
      : "(none)",
  ];
  return lines.filter((line) => line !== "").join("\n");
}
