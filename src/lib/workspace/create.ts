import { RESERVED_SUBDOMAINS } from "@/lib/sites/host";
import type { ImportField } from "@/lib/import/import-state";
import type { ImportReviewMode, ImportTheme } from "@/lib/import/repo-import";

export type CreateWorkspaceInput = {
  userId: string;
  name: string;
  subdomain: string;
  description?: string;
  theme: string;
  primaryColor: string;
  reviewMode: string;
};

export type CreateWorkspaceStore = {
  subdomainTaken(subdomain: string): Promise<boolean>;
  createEmptySite(input: {
    userId: string;
    name: string;
    subdomain: string;
    description: string | null;
    theme: ImportTheme;
    primaryColor: string;
    reviewMode: ImportReviewMode;
  }): Promise<{ siteId: string; subdomain: string }>;
};

export type CreateWorkspaceResult =
  | { status: "created"; siteId: string; subdomain: string }
  | { status: "subdomain-taken" }
  | { status: "invalid"; field: ImportField; message: string };

type ValidatedWorkspace = {
  name: string;
  subdomain: string;
  description: string | null;
  theme: ImportTheme;
  primaryColor: string;
  reviewMode: ImportReviewMode;
};

function invalid(field: ImportField, message: string): CreateWorkspaceResult {
  return { status: "invalid", field, message };
}

export function validateWorkspaceFields(input: {
  name: string;
  subdomain: string;
  description?: string;
  theme: string;
  primaryColor: string;
  reviewMode: string;
}): ValidatedWorkspace | CreateWorkspaceResult {
  const name = input.name.trim();
  if (!name) return invalid("name", "Enter a workspace name.");
  if (name.length > 80) return invalid("name", "Use 80 characters or fewer for the workspace name.");

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
    return invalid("reviewMode", "Choose a publishing mode.");
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

export async function createWorkspace(
  store: CreateWorkspaceStore,
  args: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
  const validated = validateWorkspaceFields(args);
  if ("status" in validated) return validated;
  if (await store.subdomainTaken(validated.subdomain)) {
    return { status: "subdomain-taken" };
  }
  try {
    const created = await store.createEmptySite({
      userId: args.userId,
      name: validated.name,
      subdomain: validated.subdomain,
      description: validated.description,
      theme: validated.theme,
      primaryColor: validated.primaryColor,
      reviewMode: validated.reviewMode,
    });
    return { status: "created", ...created };
  } catch (error) {
    if (await store.subdomainTaken(validated.subdomain)) {
      return { status: "subdomain-taken" };
    }
    throw error;
  }
}
