import { githubApiHeaders } from "@/lib/github/app";
import {
  githubApiError,
  isGithubRateLimitResponse,
} from "@/lib/github/api-error";
import {
  GITHUB_REQUEST_TIMEOUT_MS,
  MAX_COMPARE_FILES,
  MAX_FILE_CHARS,
  MAX_PATCH_CHARS,
  MAX_SNAPSHOT_CHARS,
  MAX_SNAPSHOT_FILES,
  MAX_TREE_PATHS,
  MAX_UNDERSTANDING_BATCHES,
} from "@/lib/copilot/limits";

const API = "https://api.github.com";
const FETCH_CONCURRENCY = 4;

export { GITHUB_REQUEST_TIMEOUT_MS };

const SKIPPED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".pdf",
  ".zip", ".gz", ".tar", ".tgz", ".7z", ".rar", ".exe", ".dll", ".so",
  ".dylib", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".mov",
  ".webm", ".wasm", ".map", ".min.js", ".min.css",
]);

const SKIPPED_PARTS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
  "vendor", "third_party", "third-party", "generated", "__snapshots__",
  "fixtures", "fixture", "testdata", "test-data",
]);

const SKIPPED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "cargo.lock",
  "poetry.lock",
  "composer.lock",
]);

const MANIFEST_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "cargo.toml",
  "go.mod",
  "composer.json",
  "gemfile",
  "pom.xml",
  "build.gradle",
  "dockerfile",
  "makefile",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "vite.config.ts",
  "astro.config.mjs",
]);

export type RepoFile = {
  path: string;
  content: string;
  truncated: boolean;
};

export type RepoSnapshot = {
  sha: string;
  branch: string;
  treePaths: string[];
  files: RepoFile[];
  omittedFiles: number;
  treeTruncated: boolean;
  /** Every relevant path, ranked. Tree listings sent to a model stay at MAX_TREE_PATHS. */
  rankedPaths?: string[];
};

export type RepoChange = {
  before: string;
  after: string;
  changedPaths: string[];
  removedPaths: string[];
  files: RepoFile[];
  patches: Array<{ path: string; patch: string }>;
  fallback: RepoSnapshot | null;
};

type TreeEntry = { path?: unknown; type?: unknown; sha?: unknown; size?: unknown };

export function isRelevantPath(path: string): boolean {
  const lower = path.toLowerCase();
  const parts = lower.split("/");
  if (parts.some((part) => SKIPPED_PARTS.has(part))) return false;
  const name = parts[parts.length - 1] ?? "";
  if (SKIPPED_FILES.has(name)) return false;
  if ([...SKIPPED_EXTENSIONS].some((extension) => lower.endsWith(extension))) {
    return false;
  }
  if (name.startsWith(".env") && !name.endsWith(".example")) return false;
  return true;
}

const PLANNING_PATH =
  /(?:^|\/)(?:roadmap|todo|todos|backlog|future|planning|ideas|vision|rfc|proposal|unreleased)(?:\/|\.|$)/;

export function isPlanningPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (PLANNING_PATH.test(lower)) return true;
  return /(?:roadmap|future-work|not-implemented|wip-notes)/.test(lower);
}

export function isRouteFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    /(?:^|\/)app\/(?:.*\/)?route\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(lower) ||
    /(?:^|\/)pages\/api\/.+\.(?:ts|tsx|js|jsx|mjs)$/.test(lower) ||
    /(?:^|\/)src\/pages\/api\/.+\.(?:ts|tsx|js|jsx|mjs)$/.test(lower)
  );
}

function isEntryPoint(path: string): boolean {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() ?? "";
  if (/(?:^|\/)(?:bin|cmd|cli)\//.test(lower)) return true;
  const depth = lower.split("/").length;
  if (depth <= 3 && /^(?:index|main|cli|server|mod)\.(?:ts|tsx|js|jsx|mjs|py|go|rs)$/.test(name)) {
    return true;
  }
  return false;
}

function isSourcePath(path: string): boolean {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() ?? "";
  if (/^(?:src|app|lib|packages|cmd|internal|prisma|server|api)\//.test(lower)) return true;
  if (/\/(?:src|lib|server|api)\//.test(lower)) return true;
  return /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|prisma)$/.test(name);
}

function isReadmeFile(path: string): boolean {
  const name = path.toLowerCase().split("/").pop() ?? "";
  return /^readme(?:\.[a-z0-9]+)?$/.test(name);
}

function isManifest(path: string): boolean {
  const name = path.toLowerCase().split("/").pop() ?? "";
  return (
    MANIFEST_FILES.has(name) ||
    name === "package.json" ||
    name === "schema.prisma" ||
    name.endsWith(".env.example") ||
    name === "pyproject.toml" ||
    name === "go.mod" ||
    name === "cargo.toml" ||
    name === "composer.json"
  );
}

/** Domain modules rank with manifests. Routes come after both. */
export function isDomainModule(path: string): boolean {
  const lower = path.toLowerCase();
  if (isReadmeFile(lower) || isManifest(lower) || isRouteFile(lower) || isPlanningPath(lower)) return false;
  if (lower.startsWith(".github/") || lower === ".github") return false;
  if (/\.(?:test|spec)\./.test(lower)) return false;
  if (/page\.(?:tsx|jsx|mdx)$/.test(lower)) return false;
  if (/(^|\/)(?:docs|examples|test|tests|__tests__)\//.test(lower)) return false;
  return (
    /(^|\/)(?:src\/lib|lib|packages|internal|domain|core|modules|server)\//.test(lower) ||
    /(^|\/)src\/(?!app\/|pages\/)/.test(lower) ||
    (isSourcePath(lower) && !/(^|\/)(?:app|pages)\//.test(lower))
  );
}

/**
 * Lower ranks are read first. The README comes before manifests and routes.
 * Domain modules rank with manifests. Planning notes and .github are last.
 */
export function contentRank(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() ?? "";
  if (lower.startsWith(".github/") || lower === ".github") return 90;
  if (isPlanningPath(lower)) return 80;
  if (isReadmeFile(lower)) return 0;
  if (isManifest(lower) || isDomainModule(lower)) return 1;
  if (isRouteFile(lower)) return 2;
  if (isEntryPoint(lower)) return 3;
  if (isSourcePath(lower)) return 4;
  if (lower.includes("/examples/") || lower.startsWith("examples/")) return 6;
  if ((lower.startsWith("docs/") || lower.includes("/docs/")) && !isPlanningPath(lower)) return 7;
  if (name.endsWith(".md") || name.endsWith(".mdx")) return 8;
  return 10;
}

export function rankContentPaths(paths: string[]): string[] {
  return paths
    .filter(isRelevantPath)
    .map((path) => ({ path, priority: contentRank(path) }))
    .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path))
    .map((item) => item.path);
}

export function selectContentCandidates(paths: string[], limit = MAX_SNAPSHOT_FILES): string[] {
  return rankContentPaths(paths).slice(0, limit);
}

export async function listRepoPaths(args: {
  owner: string;
  name: string;
  branch: string;
  token: string;
  fetcher?: typeof fetch;
  ref?: string;
}): Promise<{ sha: string; branch: string; paths: string[]; treeTruncated: boolean }> {
  const fetcher = args.fetcher ?? fetch;
  const sha = args.ref?.trim() || (await readBranchSha(args.owner, args.name, args.branch, args.token, fetcher));
  const treeResponse = await fetcher(
    `${API}/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
    { headers: githubApiHeaders(args.token), signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
  );
  if (!treeResponse.ok) throw githubApiError("GitHub tree request", treeResponse);
  const treeBody = (await treeResponse.json()) as { truncated?: unknown; tree?: unknown };
  const entries = Array.isArray(treeBody.tree) ? (treeBody.tree as TreeEntry[]) : [];
  const paths = entries
    .filter((entry) => typeof entry.path === "string" && isRelevantPath(entry.path))
    .map((entry) => entry.path as string);
  return { sha, branch: args.branch, paths, treeTruncated: treeBody.truncated === true };
}

export async function readRepoSnapshot(args: {
  owner: string;
  name: string;
  branch: string;
  token: string;
  fetcher?: typeof fetch;
  ref?: string;
  /** Limit file reads to one product directory. Empty string means the repo root, minus excludeRoots. */
  productRoot?: string;
  excludeRoots?: string[];
  /** Read later batches after the first 400 files and merge them into one snapshot. */
  readAllBatches?: boolean;
}): Promise<RepoSnapshot> {
  const fetcher = args.fetcher ?? fetch;
  const sha = args.ref?.trim() || (await readBranchSha(args.owner, args.name, args.branch, args.token, fetcher));
  const treeResponse = await fetcher(
    `${API}/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
    { headers: githubApiHeaders(args.token), signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
  );
  if (!treeResponse.ok) {
    throw githubApiError("GitHub tree request", treeResponse);
  }
  const treeBody = (await treeResponse.json()) as {
    truncated?: unknown;
    tree?: unknown;
  };
  const entries = Array.isArray(treeBody.tree) ? (treeBody.tree as TreeEntry[]) : [];
  const blobs = entries.filter(
    (entry) =>
      entry.type === "blob" &&
      typeof entry.path === "string" &&
      typeof entry.sha === "string" &&
      relevantBlob(entry.path),
  );
  const allPaths = entries
    .filter(
      (entry) =>
        typeof entry.path === "string" && isRelevantPath(entry.path),
    )
    .map((entry) => entry.path as string)
    .slice(0, MAX_TREE_PATHS);
  const rankedPaths = rankContentPaths(blobs.map((entry) => entry.path as string)).filter((path) =>
    inRoot(path, args.productRoot, args.excludeRoots),
  );
  const byPath = new Map(
    blobs
      .filter((entry): entry is TreeEntry & { path: string; sha: string } =>
        typeof entry.path === "string" && typeof entry.sha === "string",
      )
      .map((entry) => [entry.path, entry.sha]),
  );
  const batchCount = args.readAllBatches
    ? Math.min(MAX_UNDERSTANDING_BATCHES, Math.ceil(rankedPaths.length / MAX_SNAPSHOT_FILES) || 1)
    : 1;
  const files: RepoFile[] = [];
  for (let index = 0; index < batchCount; index += 1) {
    const candidates = rankedPaths.slice(index * MAX_SNAPSHOT_FILES, (index + 1) * MAX_SNAPSHOT_FILES);
    if (candidates.length === 0) break;
    const batch = await readBlobs({
      owner: args.owner,
      name: args.name,
      token: args.token,
      fetcher,
      candidates,
      byPath,
    });
    files.push(...batch);
  }
  return {
    sha,
    branch: args.branch,
    treePaths: allPaths,
    files,
    omittedFiles: Math.max(0, rankedPaths.length - files.length),
    treeTruncated: treeBody.truncated === true,
    rankedPaths,
  };
}

function inRoot(path: string, root: string | undefined, excludeRoots: string[] = []): boolean {
  if (excludeRoots.some((item) => item && (path === item || path.startsWith(`${item}/`)))) return false;
  if (!root) return true;
  return path === root || path.startsWith(`${root}/`);
}

function relevantBlob(path: string): boolean {
  if (!isRelevantPath(path)) return false;
  return !/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp[34]|mov|wasm)$/i.test(path);
}

async function readBranchSha(
  owner: string,
  name: string,
  branch: string,
  token: string,
  fetcher: typeof fetch,
): Promise<string> {
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  const response = await fetcher(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${ref}`,
    { headers: githubApiHeaders(token), signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw githubApiError("GitHub branch lookup", response);
  }
  const body = (await response.json()) as { object?: { sha?: unknown } };
  if (typeof body.object?.sha !== "string" || !body.object.sha) {
    throw new Error("GitHub did not return a branch commit.");
  }
  return body.object.sha;
}

async function readBlobs(args: {
  owner: string;
  name: string;
  token: string;
  fetcher: typeof fetch;
  candidates: string[];
  byPath: Map<string, string>;
}): Promise<RepoFile[]> {
  const files: RepoFile[] = [];
  let total = 0;
  for (let offset = 0; offset < args.candidates.length; offset += FETCH_CONCURRENCY) {
    const batch = args.candidates.slice(offset, offset + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (path) => {
        const sha = args.byPath.get(path);
        if (!sha) return null;
        const response = await args.fetcher(
          `${API}/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/git/blobs/${encodeURIComponent(sha)}`,
          { headers: githubApiHeaders(args.token), signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
        );
        if (!response.ok) {
          if (response.status === 404) return null;
          throw githubApiError("GitHub blob request", response);
        }
        const body = (await response.json()) as { content?: unknown; encoding?: unknown };
        if (typeof body.content !== "string") return null;
        const raw =
          body.encoding === "base64"
            ? Buffer.from(body.content, "base64").toString("utf8")
            : body.content;
        if (raw.includes("\u0000")) return null;
        const truncated = raw.length > MAX_FILE_CHARS;
        return {
          path,
          content: truncated ? raw.slice(0, MAX_FILE_CHARS) : raw,
          truncated,
        } satisfies RepoFile;
      }),
    );
    for (const file of results) {
      if (!file) continue;
      if (total + file.content.length > MAX_SNAPSHOT_CHARS) continue;
      total += file.content.length;
      files.push(file);
    }
    if (total >= MAX_SNAPSHOT_CHARS) break;
  }
  return files;
}

export async function readRepoChange(args: {
  owner: string;
  name: string;
  branch: string;
  before: string;
  after: string;
  token: string;
  fetcher?: typeof fetch;
}): Promise<RepoChange> {
  const fetcher = args.fetcher ?? fetch;
  if (!/^[0-9a-f]{7,40}$/i.test(args.before) || !/^[0-9a-f]{7,40}$/i.test(args.after)) {
    const fallback = await readRepoSnapshot({ ...args, fetcher, ref: args.after });
    return emptyChange(args.before, args.after, fallback);
  }
  const response = await fetcher(
    `${API}/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.name)}/compare/${encodeURIComponent(args.before)}...${encodeURIComponent(args.after)}`,
    { headers: githubApiHeaders(args.token), signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    if (isGithubRateLimitResponse(response)) {
      throw githubApiError("GitHub compare request", response);
    }
    const fallback = await readRepoSnapshot({ ...args, fetcher, ref: args.after });
    return emptyChange(args.before, args.after, fallback);
  }
  const body = (await response.json()) as { files?: unknown };
  const rows = Array.isArray(body.files)
    ? (body.files as Array<Record<string, unknown>>).slice(0, MAX_COMPARE_FILES)
    : [];
  const changedPaths: string[] = [];
  const removedPaths: string[] = [];
  const patches: Array<{ path: string; patch: string }> = [];
  for (const row of rows) {
    const path = typeof row.filename === "string" ? row.filename : "";
    if (!path || !isRelevantPath(path)) continue;
    changedPaths.push(path);
    if (row.status === "removed") {
      removedPaths.push(path);
      continue;
    }
    if (typeof row.patch === "string" && row.patch) {
      patches.push({
        path,
        patch:
          row.patch.length > MAX_PATCH_CHARS
            ? `${row.patch.slice(0, MAX_PATCH_CHARS)}\n[truncated]`
            : row.patch,
      });
    }
  }
  return {
    before: args.before,
    after: args.after,
    changedPaths,
    removedPaths,
    files: [],
    patches,
    fallback: null,
  };
}

function emptyChange(before: string, after: string, fallback: RepoSnapshot): RepoChange {
  return {
    before,
    after,
    changedPaths: fallback.treePaths,
    removedPaths: [],
    files: fallback.files,
    patches: [],
    fallback,
  };
}
