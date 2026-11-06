import type { RepoChange, RepoFile, RepoSnapshot } from "@/lib/github/repo-content";

export function buildRepoDigest(snapshot: RepoSnapshot, maxChars: number): string {
  const parts: string[] = [
    `Repository branch: ${snapshot.branch}`,
    `Commit: ${snapshot.sha}`,
    `Files in tree: ${snapshot.treePaths.length}${snapshot.treeTruncated ? " (tree truncated by GitHub)" : ""}`,
  ];
  if (snapshot.omittedFiles > 0) {
    parts.push(`Files not read: ${snapshot.omittedFiles}`);
  }
  parts.push("", "File tree:", snapshot.treePaths.slice(0, 2_000).join("\n"));
  const symbols = exportedSymbols(snapshot.files);
  if (symbols.length > 0) {
    parts.push("", "Exported symbols:", symbols.join("\n"));
  }
  appendFiles(parts, snapshot.files);
  return fit(parts.join("\n\n"), maxChars);
}

export function exportedSymbols(files: RepoFile[]): string[] {
  const rows: string[] = [];
  for (const file of files) {
    if (rows.length >= 40) break;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/i.test(file.path)) {
      continue;
    }
    const found = new Set<string>();
    const patterns = [
      /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
      /^\s*(?:pub\s+)?(?:async\s+)?(?:fn|func|def|class|struct|trait|enum)\s+([A-Za-z_$][\w$]*)/gm,
      /^\s*public\s+(?:static\s+)?(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/gm,
    ];
    patterns: for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        if (match[1]) found.add(match[1]);
        if (found.size >= 12) break patterns;
      }
    }
    if (found.size > 0) {
      rows.push(`${file.path}: ${[...found].join(", ")}`);
    }
  }
  return rows;
}

export function buildChangeDigest(change: RepoChange, maxChars: number): string {
  const parts: string[] = [
    `Changed commit: ${change.before} -> ${change.after}`,
    `Changed paths: ${change.changedPaths.length}`,
    `Removed paths: ${change.removedPaths.length}`,
  ];
  if (change.changedPaths.length > 0 && !change.fallback) {
    parts.push("", "Changed:", change.changedPaths.slice(0, 400).join("\n"));
  }
  if (change.removedPaths.length > 0) {
    parts.push("", "Removed:", change.removedPaths.slice(0, 100).join("\n"));
  }
  if (change.patches.length > 0) {
    parts.push("", "Patches:");
    for (const patch of change.patches) {
      parts.push(`--- ${patch.path}\n${patch.patch}`);
    }
  }
  if (change.files.length > 0) {
    appendFiles(parts, change.files);
  }
  if (change.fallback) {
    parts.push("", "Repository snapshot:", buildRepoDigest(change.fallback, Math.floor(maxChars / 2)));
  }
  return fit(parts.join("\n\n"), maxChars);
}

export function buildSummaryDigest(snapshot: RepoSnapshot, maxChars: number): string {
  const preferred = snapshot.files.filter((file) => {
    const lower = file.path.toLowerCase();
    return (
      /^readme(\.[a-z0-9]+)?$/.test(lower.split("/").pop() ?? "") ||
      lower.startsWith("docs/") ||
      lower.endsWith(".md") ||
      lower.endsWith(".mdx")
    );
  });
  const parts = [
    `Repository branch: ${snapshot.branch}`,
    `Commit: ${snapshot.sha}`,
    "",
    "File tree:",
    snapshot.treePaths.slice(0, 250).join("\n"),
  ];
  appendFiles(parts, preferred.length > 0 ? preferred : snapshot.files);
  return fit(parts.join("\n\n"), maxChars);
}

function appendFiles(parts: string[], files: RepoFile[]) {
  if (files.length === 0) return;
  parts.push("", "File contents:");
  for (const file of files) {
    parts.push(
      `--- ${file.path}${file.truncated ? " (truncated)" : ""}\n${file.content}`,
    );
  }
}

function fit(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 40))}\n\n[Repository context truncated]`;
}
