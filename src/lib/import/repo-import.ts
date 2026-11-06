import { RESERVED_SUBDOMAINS } from "@/lib/sites/host";
import type { ImportField } from "@/lib/import/import-state";

export type ImportTheme = "LEDGER" | "MINIMAL";
export type ImportReviewMode = "AUTO_PUBLISH" | "REVIEW";

export type ImportRepoRow = {
  id: string;
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  siteId: string | null;
  siteSubdomain: string | null;
  archived: boolean;
  removed: boolean;
};

export type ImportRepoInput = {
  repoId: string;
  userId: string;
  name: string;
  subdomain: string;
  description?: string;
  theme: string;
  primaryColor: string;
  reviewMode: string;
};

export type ImportStore = {
  findRepoForUser(repoId: string, userId: string): Promise<ImportRepoRow | null>;
  subdomainTaken(subdomain: string): Promise<boolean>;
  createSiteAndJob(input: {
    repoId: string;
    userId: string;
    name: string;
    subdomain: string;
    description: string | null;
    theme: ImportTheme;
    primaryColor: string;
    reviewMode: ImportReviewMode;
    idempotencyKey: string;
  }): Promise<{ siteId: string; jobId: string; subdomain: string }>;
};

export type ImportResult =
  | { status: "imported"; siteId: string; jobId: string; subdomain: string }
  | { status: "already-imported"; siteId: string; subdomain?: string }
  | { status: "not-found" }
  | { status: "unavailable" }
  | { status: "subdomain-taken" }
  | { status: "invalid"; field: ImportField; message: string };

type ValidatedImport = {
  name: string;
  subdomain: string;
  description: string | null;
  theme: ImportTheme;
  primaryColor: string;
  reviewMode: ImportReviewMode;
};

function invalid(field: ImportField, message: string): ImportResult {
  return { status: "invalid", field, message };
}

function validateImport(input: ImportRepoInput): ValidatedImport | ImportResult {
  const name = input.name.trim();
  if (!name) return invalid("name", "Enter a site name.");
  if (name.length > 80) return invalid("name", "Use 80 characters or fewer for the site name.");

  const subdomain = input.subdomain.trim().toLowerCase();
  if (
    subdomain.length < 2 ||
    subdomain.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
  ) {
    return invalid(
      "subdomain",
      "Use 2 to 63 letters, numbers, or hyphens. Do not start or end with a hyphen.",
    );
  }
  if (RESERVED_SUBDOMAINS.has(subdomain)) {
    return invalid("subdomain", "That subdomain is reserved. Choose another.");
  }

  const description = (input.description ?? "").trim();
  if (description.length > 280) {
    return invalid("description", "Use 280 characters or fewer for the description.");
  }

  const theme = input.theme.trim().toUpperCase();
  if (theme !== "LEDGER" && theme !== "MINIMAL") {
    return invalid("theme", "Choose the Ledger or Minimal theme.");
  }

  const primaryColor = input.primaryColor.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(primaryColor)) {
    return invalid("primaryColor", "Choose a six-digit hex color.");
  }

  const reviewMode = input.reviewMode.trim().toUpperCase();
  if (reviewMode !== "AUTO_PUBLISH" && reviewMode !== "REVIEW") {
    return invalid("reviewMode", "Choose auto-publish or review first.");
  }

  return {
    name,
    subdomain,
    description: description || null,
    theme,
    primaryColor,
    reviewMode,
  };
}

export async function importRepo(
  store: ImportStore,
  args: ImportRepoInput,
): Promise<ImportResult> {
  const repo = await store.findRepoForUser(args.repoId, args.userId);
  if (!repo) return { status: "not-found" };
  if (repo.siteId) {
    return {
      status: "already-imported",
      siteId: repo.siteId,
      subdomain: repo.siteSubdomain ?? undefined,
    };
  }
  if (repo.archived || repo.removed) return { status: "unavailable" };

  const validated = validateImport(args);
  if ("status" in validated) return validated;

  if (await store.subdomainTaken(validated.subdomain)) {
    return { status: "subdomain-taken" };
  }

  try {
    const created = await store.createSiteAndJob({
      repoId: repo.id,
      userId: args.userId,
      name: validated.name,
      subdomain: validated.subdomain,
      description: validated.description,
      theme: validated.theme,
      primaryColor: validated.primaryColor,
      reviewMode: validated.reviewMode,
      idempotencyKey: `first-build:${repo.id}`,
    });
    return { status: "imported", ...created };
  } catch (error) {
    const again = await store.findRepoForUser(args.repoId, args.userId);
    if (again?.siteId) {
      return {
        status: "already-imported",
        siteId: again.siteId,
        subdomain: again.siteSubdomain ?? undefined,
      };
    }
    if (await store.subdomainTaken(validated.subdomain)) {
      return { status: "subdomain-taken" };
    }
    throw error;
  }
}
