import type { EnvVarFact, HttpRoute, RepoFacts, ScriptFact } from "@/lib/copilot/facts";
import type { RepoFile, RepoSnapshot } from "@/lib/github/repo-content";

export type ProductKind = "hosted-app" | "library" | "cli" | "sdk";

export type SurfaceScreen = {
  route: string;
  title: string;
  source: string;
};

export type SurfaceAction = {
  label: string;
  source: string;
};

export type SurfaceError = {
  message: string;
  source: string;
};

export type ProductSurface = {
  kind: ProductKind;
  name: string;
  promise: string;
  screens: SurfaceScreen[];
  actions: SurfaceAction[];
  endpoints: HttpRoute[];
  settings: EnvVarFact[];
  errors: SurfaceError[];
  scripts: ScriptFact[];
  readmeClaim: string;
};

const MAX_SCREENS = 8;
const MAX_ACTIONS = 12;
const MAX_ERRORS = 8;

export function extractProductSurface(
  snapshot: Pick<RepoSnapshot, "files" | "treePaths">,
  facts: RepoFacts,
): ProductSurface {
  const screens = extractScreens(snapshot.files);
  const kind = inferProductKind(facts, snapshot.treePaths, screens.length > 0);
  return {
    kind,
    name: titleFromPackage(facts.packageName) || "This product",
    promise: promiseFrom(facts),
    screens,
    actions: extractActions(snapshot.files),
    endpoints: facts.routes,
    settings: facts.envVars,
    errors: extractErrors(snapshot.files),
    scripts: facts.scripts,
    readmeClaim: facts.readmeExcerpt.split("\n").find((line) => line.trim() && !line.startsWith("#"))?.trim() ?? "",
  };
}

export function inferProductKind(
  facts: Pick<RepoFacts, "audience" | "binaries" | "packageMain" | "routes">,
  treePaths: string[],
  hasScreens: boolean,
): ProductKind {
  if (facts.audience === "cli" || facts.binaries.length > 0) return "cli";
  if (hasScreens) return "hosted-app";
  if (facts.routes.length > 0) return "sdk";
  if (facts.packageMain || treePaths.some((path) => path.split("/").pop() === "package.json")) return "library";
  return "library";
}

function extractScreens(files: RepoFile[]): SurfaceScreen[] {
  const screens: SurfaceScreen[] = [];
  for (const file of files) {
    const route = screenRoute(file.path);
    if (!route) continue;
    screens.push({
      route,
      title: screenTitle(file, route),
      source: file.path,
    });
    if (screens.length >= MAX_SCREENS) break;
  }
  return screens;
}

export function screenRoute(filePath: string): string | null {
  const path = filePath.replace(/\\/g, "/");
  if (/\/api\//.test(path) || /(^|\/)pages\/api\//.test(path)) return null;
  const app = path.match(/(?:^|\/)app\/(.*)page\.(?:tsx|jsx)$/);
  if (app) {
    const rest = app[1]
      .replace(/\/?\([^/]+\)\//g, "/")
      .replace(/\/?\([^/]+\)$/g, "")
      .replace(/\/+$/, "");
    if (rest.includes("[")) return null;
    return rest ? `/${rest}` : "/";
  }
  const pages = path.match(/(?:^|\/)pages\/(.+)\.(?:tsx|jsx)$/);
  if (!pages) return null;
  if (pages[1].includes("[")) return null;
  if (pages[1] === "index" || pages[1] === "_app" || pages[1] === "_document") {
    return pages[1] === "index" ? "/" : null;
  }
  return `/${pages[1].replace(/\/index$/, "")}`;
}

function screenTitle(file: RepoFile, route: string): string {
  const heading = file.content.match(/<h1[^>]*>\s*([^<]{2,80})\s*<\/h1>/i);
  if (heading) return cleanLabel(heading[1]);
  if (route === "/") return "Home";
  const segment = route.split("/").filter(Boolean).pop() ?? "Page";
  return titleFromPackage(segment);
}

function extractActions(files: RepoFile[]): SurfaceAction[] {
  const actions: SurfaceAction[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!screenRoute(file.path) && !/components?\//.test(file.path)) continue;
    for (const match of file.content.matchAll(/<(?:Button|button)[^>]*>\s*([^<{][^<]{0,60}?)\s*<\/(?:Button|button)>/g)) {
      const label = cleanLabel(match[1]);
      if (label.length < 2 || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      actions.push({ label, source: file.path });
      if (actions.length >= MAX_ACTIONS) return actions;
    }
  }
  return actions;
}

function extractErrors(files: RepoFile[]): SurfaceError[] {
  const errors: SurfaceError[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!/error|toast|empty/i.test(file.path) && !/toast\.|setError\(/.test(file.content)) continue;
    for (const match of file.content.matchAll(/(?:toast\.error|setError)\(\s*["'`]([^"'`]{4,80})["'`]/g)) {
      const message = cleanLabel(match[1]);
      if (seen.has(message)) continue;
      seen.add(message);
      errors.push({ message, source: file.path });
      if (errors.length >= MAX_ERRORS) return errors;
    }
  }
  return errors;
}

function promiseFrom(facts: RepoFacts): string {
  if (facts.packageDescription) return facts.packageDescription;
  const line = facts.readmeExcerpt
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#") && !item.startsWith("!"));
  return line?.replace(/^[-*]\s*/, "").slice(0, 200) || "";
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleFromPackage(name: string | null): string {
  if (!name) return "";
  const bare = name.split("/").pop() ?? name;
  return bare
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
