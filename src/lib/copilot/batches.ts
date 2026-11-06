import type { RepoFacts } from "@/lib/copilot/facts";
import { MAX_SNAPSHOT_FILES, MAX_TREE_PATHS, MAX_UNDERSTANDING_BATCHES } from "@/lib/copilot/limits";

export type ProductArea = {
  id: string;
  name: string;
  root: string;
};

const WORKSPACE_GROUPS = new Set(["packages", "apps", "services", "crates", "products"]);
const AREA_MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json)$/i;

export function detectProductAreas(treePaths: string[]): ProductArea[] {
  const areas: ProductArea[] = [];
  const seen = new Set<string>();
  for (const path of treePaths) {
    if (!AREA_MANIFEST.test(path)) continue;
    const root = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parts = root ? root.split("/") : [];
    if (parts.length > 2) continue;
    if (parts.length === 1 && !WORKSPACE_GROUPS.has(parts[0].toLowerCase())) continue;
    if (parts.length === 2 && !WORKSPACE_GROUPS.has(parts[0].toLowerCase())) continue;
    if (seen.has(root)) continue;
    seen.add(root);
    const name = root ? (root.split("/").pop() ?? root) : "repository";
    areas.push({ id: root || "root", name, root });
  }
  return areas.sort((a, b) => a.root.localeCompare(b.root) || a.name.localeCompare(b.name));
}

export function chooseProductArea(
  areas: ProductArea[],
  hint: string,
  requestedRoot?: string | null,
): { area: ProductArea; others: ProductArea[]; ambiguous: boolean } {
  const list = areas.length > 0 ? areas : [{ id: "root", name: hint.trim() || "repository", root: "" }];
  if (requestedRoot !== undefined && requestedRoot !== null) {
    const found = list.find((area) => area.root === requestedRoot) ?? {
      id: requestedRoot || "root",
      name: requestedRoot.split("/").filter(Boolean).pop() || hint.trim() || "repository",
      root: requestedRoot,
    };
    return {
      area: found,
      others: list.filter((area) => area.root !== found.root),
      ambiguous: false,
    };
  }
  const norm = normalizeName(hint);
  const match = norm
    ? list.find((area) => {
        const name = normalizeName(area.name);
        return name.length > 0 && (name === norm || norm.includes(name) || name.includes(norm));
      })
    : undefined;
  if (list.length <= 1) {
    return { area: match ?? list[0], others: [], ambiguous: false };
  }
  if (match) {
    return { area: match, others: list.filter((area) => area.root !== match.root), ambiguous: false };
  }
  const root = list.find((area) => area.root === "") ?? list[0];
  return {
    area: root,
    others: list.filter((area) => area.root !== root.root),
    ambiguous: true,
  };
}

export function inProductArea(path: string, root: string, excludedRoots: string[] = []): boolean {
  if (excludedRoots.some((item) => item && (path === item || path.startsWith(`${item}/`)))) return false;
  if (!root) return true;
  return path === root || path.startsWith(`${root}/`);
}

export function batchPaths<T>(items: T[], size = MAX_SNAPSHOT_FILES): T[][] {
  if (size < 1) throw new Error("batch size must be at least 1");
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function understandingBatchCount(fileCount: number): number {
  if (fileCount <= 0) return 0;
  return Math.min(MAX_UNDERSTANDING_BATCHES, Math.ceil(fileCount / MAX_SNAPSHOT_FILES));
}

export function mergeFacts(parts: RepoFacts[]): RepoFacts {
  const present = parts.filter(Boolean);
  if (present.length === 0) {
    return {
      audience: "library",
      packageName: null,
      packageDescription: null,
      packageMain: null,
      binaries: [],
      routes: [],
      envVars: [],
      scripts: [],
      schemaModels: [],
      entryPoints: [],
      readmePath: null,
      readmeExcerpt: "",
    };
  }
  const first = present[0];
  const routes = new Map<string, RepoFacts["routes"][number]>();
  const envVars = new Map<string, RepoFacts["envVars"][number]>();
  const scripts = new Map<string, RepoFacts["scripts"][number]>();
  const schemaModels = new Map<string, RepoFacts["schemaModels"][number]>();
  const binaries = new Set<string>();
  const entryPoints = new Set<string>();
  let readme = { path: first.readmePath, excerpt: first.readmeExcerpt };
  let packageName = first.packageName;
  let packageDescription = first.packageDescription;
  let packageMain = first.packageMain;
  let audience = first.audience;
  for (const part of present) {
    if (!packageName && part.packageName) packageName = part.packageName;
    if (!packageDescription && part.packageDescription) packageDescription = part.packageDescription;
    if (!packageMain && part.packageMain) packageMain = part.packageMain;
    if (audience === "library" && part.audience !== "library") audience = part.audience;
    for (const route of part.routes) routes.set(`${route.method} ${route.path}`, route);
    for (const item of part.envVars) if (!envVars.has(item.name)) envVars.set(item.name, item);
    for (const script of part.scripts) if (!scripts.has(script.name)) scripts.set(script.name, script);
    for (const model of part.schemaModels) if (!schemaModels.has(model.name)) schemaModels.set(model.name, model);
    for (const binary of part.binaries) binaries.add(binary);
    for (const entry of part.entryPoints) entryPoints.add(entry);
    if ((part.readmeExcerpt?.length ?? 0) > (readme.excerpt?.length ?? 0)) {
      readme = { path: part.readmePath, excerpt: part.readmeExcerpt };
    }
  }
  return {
    audience,
    packageName,
    packageDescription,
    packageMain,
    binaries: [...binaries],
    routes: [...routes.values()],
    envVars: [...envVars.values()],
    scripts: [...scripts.values()],
    schemaModels: [...schemaModels.values()],
    entryPoints: [...entryPoints],
    readmePath: readme.path,
    readmeExcerpt: readme.excerpt,
  };
}

export function coverageNote(input: {
  area: ProductArea;
  others: ProductArea[];
  ambiguous: boolean;
  batches: number;
  considered: number;
  read: number;
  treeTruncated: boolean;
}): string {
  const where = input.area.root ? `${input.area.name} (${input.area.root})` : input.area.name;
  const sentences = [
    `Documenting ${where}.`,
    `Read ${input.read} of ${input.considered} useful files in ${input.batches} batch${input.batches === 1 ? "" : "es"}.`,
  ];
  if (input.ambiguous && input.others.length > 0) {
    const names = input.others.map((area) => area.root || area.name).join(", ");
    sentences.push(
      `This repository also contains ${names}. This outline covers ${input.area.name} only. Choose another product before approving if you want that area instead.`,
    );
  } else if (input.others.length > 0) {
    sentences.push(`Not covering ${input.others.map((area) => area.root || area.name).join(", ")}.`);
  }
  if (input.read < input.considered) {
    sentences.push(
      `${input.considered - input.read} files in this product were not read. The outline does not include them.`,
    );
  }
  if (input.treeTruncated) {
    sentences.push("GitHub truncated the file tree, so some paths were never listed.");
  }
  if (input.considered > MAX_TREE_PATHS * MAX_UNDERSTANDING_BATCHES) {
    sentences.push("The file list is larger than the batches this run can cover.");
  }
  return sentences.join(" ");
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
