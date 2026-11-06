"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUserAction } from "@/lib/admin/guard";
import { flashToast } from "@/lib/toast-server";
import type { ImportField, ImportFormState, WorkspaceFormState } from "@/lib/import/import-state";
import { importRepo, type ImportResult } from "@/lib/import/repo-import";
import { assertCredits } from "@/lib/credits/apply";
import {
  createPrismaImportStore,
  createPrismaWorkspaceStore,
} from "@/lib/import/prisma-import-store";
import { attachRepoToWorkspace, type AttachRepoResult } from "@/lib/workspace/attach-repo";
import { brandPrimary } from "@/lib/brand";
import { createWorkspace, type CreateWorkspaceResult } from "@/lib/workspace/create";

function failure(field: ImportField | "form", message: string): ImportFormState {
  return { error: { field, message } };
}

function workspacePath(subdomain: string) {
  return `/dashboard/w/${subdomain}`;
}

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function attachFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("already has a repository")) return message;
  if (message.includes("Unique constraint") || message.includes("idempotencyKey")) {
    return "A build for that repository is already queued.";
  }
  if (message.includes("repoId") && message.includes("null")) {
    return "The database still requires a repository on every workspace. Run prisma migrate deploy, then try again.";
  }
  if (message.includes("Argument") && message.includes("repoId")) {
    return "Could not attach that repository. Refresh the page and try again.";
  }
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean && clean.length < 180 && !/postgres|prisma|secret|password/i.test(clean)) {
    return clean;
  }
  return "Could not start the build. Try again.";
}

export async function createWorkspaceAction(
  _previous: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const session = await requireUserAction();
  const store = createPrismaWorkspaceStore();
  if (!store) return failure("form", "The database is not connected.");

  let result: CreateWorkspaceResult;
  try {
    result = await createWorkspace(store, {
      userId: session.userId,
      name: String(formData.get("name") ?? ""),
      subdomain: String(formData.get("subdomain") ?? ""),
      description: String(formData.get("description") ?? ""),
      theme: String(formData.get("theme") ?? "MINIMAL"),
      primaryColor: String(formData.get("primaryColor") ?? brandPrimary()),
      reviewMode: String(formData.get("reviewMode") ?? "AUTO_PUBLISH"),
    });
  } catch {
    return failure("form", "Could not create the workspace. Try again.");
  }

  if (result.status === "created") {
    revalidatePath("/dashboard");
    await flashToast("success", "Workspace created. Import a repository to start building.");
    redirect(workspacePath(result.subdomain));
  }
  if (result.status === "subdomain-taken") {
    return failure("subdomain", "That subdomain is already taken. Choose another.");
  }
  return failure(result.field, result.message);
}

export async function attachRepositoryAction(formData: FormData) {
  const session = await requireUserAction();
  const siteId = String(formData.get("siteId") ?? "");
  const repoId = String(formData.get("repoId") ?? "");
  const subdomainHint = String(formData.get("subdomain") ?? "");
  const back = subdomainHint ? workspacePath(subdomainHint) : "/dashboard";
  const store = createPrismaWorkspaceStore();
  if (!store) {
    await flashToast("error", "The database is not connected.");
    redirect(back);
  }
  const credits = await assertCredits(session.userId);
  if (!credits.ok) {
    await flashToast("error", credits.error);
    redirect(back);
  }

  let result: AttachRepoResult;
  try {
    result = await attachRepoToWorkspace(store, {
      siteId,
      repoId,
      userId: session.userId,
    });
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    console.error("attachRepositoryAction failed", error);
    await flashToast("error", attachFailureMessage(error));
    redirect(back);
  }

  if (result.status === "attached" || result.status === "already-attached") {
    revalidatePath("/dashboard");
    revalidatePath(workspacePath(result.subdomain));
    await flashToast("success", "Build queued. Watch the agent in chat.");
    redirect(workspacePath(result.subdomain));
  }
  if (result.status === "site-has-repo") {
    await flashToast("info", "This workspace already has a repository.");
    redirect(workspacePath(result.subdomain));
  }
  if (result.status === "repo-imported") {
    revalidatePath("/dashboard");
    await flashToast("info", "That repository is already imported.");
    redirect(`/dashboard/sites/${result.siteId}`);
  }
  if (result.status === "unavailable") {
    await flashToast("error", "That repo is archived or removed and cannot be imported.");
    redirect(back);
  }
  await flashToast("error", "That repo is not available in the selected GitHub account.");
  redirect(back);
}

export async function importRepository(
  _previous: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const session = await requireUserAction();
  const repoId = String(formData.get("repoId") ?? "");
  const store = createPrismaImportStore();
  if (!store) return failure("form", "The database is not connected.");
  const credits = await assertCredits(session.userId);
  if (!credits.ok) return failure("form", credits.error);

  let result: ImportResult;
  try {
    result = await importRepo(store, {
      repoId,
      userId: session.userId,
      name: String(formData.get("name") ?? ""),
      subdomain: String(formData.get("subdomain") ?? ""),
      description: String(formData.get("description") ?? ""),
      theme: String(formData.get("theme") ?? "MINIMAL"),
      primaryColor: String(formData.get("primaryColor") ?? brandPrimary()),
      reviewMode: String(formData.get("reviewMode") ?? "AUTO_PUBLISH"),
    });
  } catch {
    return failure("form", "Could not start the build. Try again.");
  }

  if (result.status === "imported") {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/sites");
    await flashToast("success", "Build queued. Watch the agent in chat.");
    redirect(workspacePath(result.subdomain));
  }
  if (result.status === "already-imported") {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/sites");
    await flashToast("info", "That repository is already imported.");
    redirect(
      result.subdomain
        ? workspacePath(result.subdomain)
        : `/dashboard/sites/${result.siteId}`,
    );
  }

  switch (result.status) {
    case "invalid":
      return failure(result.field, result.message);
    case "subdomain-taken":
      return failure("subdomain", "That subdomain is already taken. Choose another.");
    case "not-found":
      return failure("form", "That repo is not available in the selected GitHub account.");
    case "unavailable":
      return failure("form", "That repo is archived or removed and cannot be imported.");
  }
}
