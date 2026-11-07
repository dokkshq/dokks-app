"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewSession } from "@/lib/admin/act-as";
import { blockActAsWrites } from "@/lib/admin/guard";
import { DEFAULT_SMALL_MODEL, selectModel, taskSizeForJob } from "@/lib/copilot/models";
import { assertCredits } from "@/lib/credits/apply";
import { getPrisma } from "@/lib/db";
import { flashToast, redirectWithToast } from "@/lib/toast-server";
import {
  approveRevision,
  rejectRevision,
} from "@/lib/sites/publish";
import { retryWorkspaceBuild } from "@/lib/workspace/retry-build";

export async function approveRevisionAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  if (!session) redirect(`/login?next=/dashboard/sites/${siteId}`);
  await blockActAsWrites();
  const result = await approveRevision({
    revisionId,
    ownerId: session.userId,
  });
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath("/dashboard/sites");
  revalidatePath(`/dashboard/sites/${siteId}/revisions/${revisionId}`);
  if (!result.ok) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}/revisions/${revisionId}?error=${encodeURIComponent(result.error)}`,
      "error",
      result.error,
    );
  }
  return redirectWithToast(`/dashboard/sites/${siteId}?approved=1`, "success", "Revision published.");
}

export async function rejectRevisionAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const revisionId = String(formData.get("revisionId") ?? "");
  if (!session) redirect(`/login?next=/dashboard/sites/${siteId}`);
  await blockActAsWrites();
  const note = String(formData.get("note") ?? "");
  const result = await rejectRevision({
    revisionId,
    ownerId: session.userId,
    note,
  });
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath("/dashboard/sites");
  revalidatePath(`/dashboard/sites/${siteId}/revisions/${revisionId}`);
  if (!result.ok) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}/revisions/${revisionId}?error=${encodeURIComponent(result.error)}`,
      "error",
      result.error,
    );
  }
  return redirectWithToast(`/dashboard/sites/${siteId}?rejected=1`, "success", "Revision rejected.");
}

export async function retryBuildAction(formData: FormData) {
  const siteId = String(formData.get("siteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  if (!siteId || !jobId) redirect("/dashboard");
  const session = await getViewSession();
  if (!session) redirect(`/login?next=/dashboard/sites/${encodeURIComponent(siteId)}`);
  await blockActAsWrites();
  const result = await retryWorkspaceBuild({ session, siteId, jobId });
  const destination = result.subdomain
    ? `/dashboard/w/${result.subdomain}/builds`
    : "/dashboard";
  if (!result.ok) return redirectWithToast(destination, "error", result.error);
  return redirectWithToast(destination, "success", "Build queued again.");
}

export async function setReviewModeAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  if (!session) redirect(`/login?next=/dashboard/sites/${siteId}`);
  await blockActAsWrites();
  const mode = String(formData.get("reviewMode") ?? "");
  if (mode !== "REVIEW") {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=Choose+draft.`,
      "error",
      "Choose draft.",
    );
  }
  const prisma = getPrisma();
  if (!prisma) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=The+database+is+not+connected.`,
      "error",
      "The database is not connected.",
    );
  }
  const updated = await prisma.site.updateMany({
    where: { id: siteId, ownerId: session.userId },
    data: { reviewMode: mode },
  });
  if (updated.count !== 1) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=Site+not+found.`,
      "error",
      "Site not found.",
    );
  }
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath("/dashboard/sites");
  return redirectWithToast(
    `/dashboard/sites/${siteId}?saved=1`,
    "success",
    "Update mode saved.",
  );
}

export async function refreshSummaryAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  if (!session) redirect(`/login?next=/dashboard/sites/${siteId}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=The+database+is+not+connected.`,
      "error",
      "The database is not connected.",
    );
  }
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: session.userId },
    select: { repoId: true, status: true },
  });
  if (!site) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=Site+not+found.`,
      "error",
      "Site not found.",
    );
  }
  if (site.status === "PAUSED") {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=This+site+is+paused.`,
      "error",
      "This site is paused.",
    );
  }
  if (!site.repoId) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=${encodeURIComponent("Import a repository first.")}`,
      "error",
      "Import a repository first.",
    );
  }
  const credits = await assertCredits(session.userId);
  if (!credits.ok) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=${encodeURIComponent(credits.error)}`,
      "error",
      credits.error,
    );
  }
  const activeSummary = await prisma.job.findFirst({
    where: {
      repoId: site.repoId,
      kind: "SUMMARY_REFRESH",
      status: { in: ["QUEUED", "RUNNING"] },
    },
    select: { id: true },
  });
  if (activeSummary) {
    return redirectWithToast(
      `/dashboard/sites/${siteId}?error=A+summary+refresh+is+already+queued.`,
      "info",
      "A summary refresh is already queued.",
    );
  }
  await prisma.job.create({
    data: {
      repoId: site.repoId,
      kind: "SUMMARY_REFRESH",
      status: "QUEUED",
      provider: "XAI",
      model: DEFAULT_SMALL_MODEL,
      idempotencyKey: `summary:${site.repoId}:${Date.now()}`,
    },
  });
  revalidatePath(`/dashboard/sites/${siteId}`);
  return redirectWithToast(
    `/dashboard/sites/${siteId}?summary=1`,
    "success",
    "Summary refresh queued.",
  );
}

export async function sendChatEditAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const pageId = String(formData.get("pageId") ?? "");
  const instruction = String(formData.get("instruction") ?? "").trim();
  const backTo = `/dashboard/sites/${siteId}/chat?page=${encodeURIComponent(slug)}`;
  if (!session) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  await blockActAsWrites();
  if (!instruction) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("Write an instruction first.")}`,
      "error",
      "Write an instruction first.",
    );
  }
  if (instruction.length > 4_000) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("Use 4,000 characters or fewer.")}`,
      "error",
      "Use 4,000 characters or fewer.",
    );
  }
  const prisma = getPrisma();
  if (!prisma) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("The database is not connected.")}`,
      "error",
      "The database is not connected.",
    );
  }
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: session.userId },
    select: { id: true, repoId: true, status: true },
  });
  if (!site) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("Site not found.")}`,
      "error",
      "Site not found.",
    );
  }
  if (site.status === "PAUSED") {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("This site is paused.")}`,
      "error",
      "This site is paused.",
    );
  }
  if (!site.repoId) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent("Import a repository before chatting.")}`,
      "error",
      "Import a repository before chatting.",
    );
  }
  // Captured before the transaction. Property narrowing does not survive the closure.
  const repoId = site.repoId;
  const credits = await assertCredits(session.userId);
  if (!credits.ok) {
    return redirectWithToast(
      `${backTo}&error=${encodeURIComponent(credits.error)}`,
      "error",
      credits.error,
    );
  }
  let focusPageId: string | null = null;
  if (pageId) {
    const page = await prisma.page.findFirst({
      where: { id: pageId, siteId },
      select: { id: true },
    });
    if (!page) {
      return redirectWithToast(
        `${backTo}&error=${encodeURIComponent("That page no longer exists.")}`,
        "error",
        "That page no longer exists.",
      );
    }
    focusPageId = page.id;
  }

  const task = taskSizeForJob("CHAT_EDIT", instruction);
  const choice = selectModel(task, {
    XAI_HEAVY_MODEL: process.env.XAI_HEAVY_MODEL,
    XAI_SMALL_MODEL: process.env.XAI_SMALL_MODEL,
  });
  const job = await prisma.$transaction(async (tx) => {
    const chat = await tx.chatEdit.create({
      data: {
        siteId,
        pageId: focusPageId,
        userId: session.userId,
        instruction,
      },
      select: { id: true },
    });
    const created = await tx.job.create({
      data: {
        repoId,
        kind: "CHAT_EDIT",
        status: "QUEUED",
        provider: "XAI",
        model: choice.model,
        idempotencyKey: `chat:${chat.id}`,
      },
      select: { id: true },
    });
    await tx.chatEdit.update({
      where: { id: chat.id },
      data: { jobId: created.id },
    });
    return created;
  });
  revalidatePath(`/dashboard/sites/${siteId}`);
  revalidatePath(`/dashboard/sites/${siteId}/chat`);
  revalidatePath("/dashboard");
  const requested = String(formData.get("returnTo") ?? "");
  const returnTo =
    requested.startsWith("/dashboard/") && !requested.startsWith("//")
      ? requested
      : `/dashboard/sites/${siteId}/builds/${job.id}?queued=1`;
  await flashToast("success", "Chat edit queued.");
  redirect(returnTo);
}
