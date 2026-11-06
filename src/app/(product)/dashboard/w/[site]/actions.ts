"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewSession } from "@/lib/admin/act-as";
import { blockActAsWrites } from "@/lib/admin/guard";
import { acceptOwnerPlan, readStoredPlan } from "@/lib/copilot/plan-gate";
import { getPrisma } from "@/lib/db";
import { approveRevision, rejectRevision } from "@/lib/sites/publish";
import { ProfileStorageUnconfigured } from "@/lib/profile/storage";
import { BrandImageError, deleteSiteBrandImage, uploadSiteBrandImage } from "@/lib/sites/brand-storage";
import { redirectWithToast } from "@/lib/toast-server";
import { retryWorkspaceBuild } from "@/lib/workspace/retry-build";

function pathFor(subdomain: string, section = "") {
  return `/dashboard/w/${subdomain}${section}`;
}

async function ownedSite(siteId: string, userId: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  return prisma.site.findFirst({
    where: { id: siteId, ownerId: userId },
    select: { id: true, subdomain: true, repoId: true, status: true },
  });
}

export async function retryBuildAction(formData: FormData) {
  const siteId = String(formData.get("siteId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const subdomainHint = String(formData.get("subdomain") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "");
  const session = await getViewSession();
  const back =
    returnTo.startsWith("/dashboard/w/") && !returnTo.includes("//")
      ? returnTo
      : subdomainHint
        ? pathFor(subdomainHint, "/builds")
        : "/dashboard";
  if (!siteId || !jobId) redirect("/dashboard");
  if (!session) redirect(`/login?next=${encodeURIComponent(back)}`);
  await blockActAsWrites();
  const result = await retryWorkspaceBuild({ session, siteId, jobId });
  const destination =
    result.subdomain && returnTo.startsWith(`/dashboard/w/${result.subdomain}`)
      ? returnTo
      : result.subdomain
        ? pathFor(result.subdomain, "/builds")
        : back;
  if (!result.ok) return redirectWithToast(destination, "error", result.error);
  return redirectWithToast(destination, "success", "Build queued again.");
}

export async function publishDraftAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  if (!session) redirect(`/login?next=${pathFor(subdomain)}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) return redirectWithToast(pathFor(subdomain), "error", "The database is not connected.");
  const site = await ownedSite(siteId, session.userId);
  if (!site) return redirectWithToast("/dashboard", "error", "Site not found.");
  const pending = await prisma.pageRevision.findMany({
    where: { siteId, status: "PENDING" },
    select: { id: true },
  });
  for (const revision of pending) {
    const result = await approveRevision({ revisionId: revision.id, ownerId: session.userId });
    if (!result.ok) return redirectWithToast(pathFor(site.subdomain), "error", result.error);
  }
  revalidatePath(pathFor(site.subdomain));
  return redirectWithToast(pathFor(site.subdomain), "success", "Published.");
}

export async function discardDraftAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  if (!session) redirect(`/login?next=${pathFor(subdomain)}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) return redirectWithToast(pathFor(subdomain), "error", "The database is not connected.");
  const site = await ownedSite(siteId, session.userId);
  if (!site) return redirectWithToast("/dashboard", "error", "Site not found.");
  const pending = await prisma.pageRevision.findMany({
    where: { siteId, status: "PENDING" },
    select: { id: true },
  });
  for (const revision of pending) {
    const result = await rejectRevision({ revisionId: revision.id, ownerId: session.userId, note: null });
    if (!result.ok) return redirectWithToast(pathFor(site.subdomain), "error", result.error);
  }
  revalidatePath(pathFor(site.subdomain));
  return redirectWithToast(pathFor(site.subdomain), "success", "Discarded.");
}

export async function saveWorkspaceAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  const section = String(formData.get("section") ?? "");
  if (!session) redirect(`/login?next=${pathFor(subdomain, section)}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) return redirectWithToast(pathFor(subdomain, section), "error", "The database is not connected.");
  const site = await ownedSite(siteId, session.userId);
  if (!site) return redirectWithToast("/dashboard", "error", "Site not found.");
  const kind = String(formData.get("kind") ?? "");
  if (kind === "branding") {
    const theme = String(formData.get("theme") ?? "");
    const appearance = String(formData.get("appearance") ?? "");
    const color = String(formData.get("primaryColor") ?? "").trim().toLowerCase();
    const back = pathFor(site.subdomain, "/branding");
    if (theme !== "LEDGER" && theme !== "MINIMAL") {
      return redirectWithToast(back, "error", "Choose a theme.");
    }
    if (appearance !== "SYSTEM" && appearance !== "LIGHT" && appearance !== "DARK") {
      return redirectWithToast(back, "error", "Choose an appearance.");
    }
    if (!/^#[0-9a-f]{6}$/.test(color)) {
      return redirectWithToast(back, "error", "Choose a primary color.");
    }
    const current = await prisma.site.findUnique({
      where: { id: site.id },
      select: { logoLightUrl: true, logoDarkUrl: true, faviconUrl: true },
    });
    if (!current) return redirectWithToast("/dashboard", "error", "Site not found.");
    await prisma.site.update({
      where: { id: site.id },
      data: { theme, appearance, primaryColor: color },
    });
    const created: string[] = [];
    try {
      const logoLight = await nextBrandUrl({
        siteId: site.id,
        slot: "logo-light",
        field: "logoLight",
        formData,
        remove: formData.get("removeLogoLight") === "1",
        current: current.logoLightUrl,
        created,
      });
      const logoDark = await nextBrandUrl({
        siteId: site.id,
        slot: "logo-dark",
        field: "logoDark",
        formData,
        remove: formData.get("removeLogoDark") === "1",
        current: current.logoDarkUrl,
        created,
      });
      const favicon = await nextBrandUrl({
        siteId: site.id,
        slot: "favicon",
        field: "favicon",
        formData,
        remove: formData.get("removeFavicon") === "1",
        current: current.faviconUrl,
        created,
      });
      await prisma.site.update({
        where: { id: site.id },
        data: {
          logoLightUrl: logoLight.url,
          logoDarkUrl: logoDark.url,
          faviconUrl: favicon.url,
        },
      });
      await Promise.all([logoLight.retire, logoDark.retire, favicon.retire].map((url) => deleteSiteBrandImage(url)));
    } catch (error) {
      if (isNextControlFlow(error)) throw error;
      console.error("[branding] image save failed", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        reason:
          error !== null && typeof error === "object" && "reason" in error
            ? String((error as { reason?: unknown }).reason)
            : undefined,
      });
      await Promise.all(created.map((url) => deleteSiteBrandImage(url)));
      return redirectWithToast(back, "error", imageSaveMessage(error));
    }
    revalidatePath(`/preview/${site.subdomain}`);
    revalidatePath(pathFor(site.subdomain), "layout");
  } else if (kind === "domain") {
    const nextSubdomain = String(formData.get("nextSubdomain") ?? "").trim().toLowerCase();
    const customDomain = emptyToNull(formData.get("customDomain"));
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(nextSubdomain)) {
      return redirectWithToast(pathFor(site.subdomain, "/domain"), "error", "Choose a subdomain.");
    }
    const taken = await prisma.site.findFirst({
      where: { subdomain: nextSubdomain, NOT: { id: site.id } },
      select: { id: true },
    });
    if (taken) return redirectWithToast(pathFor(site.subdomain, "/domain"), "error", "That subdomain is taken.");
    await prisma.site.update({
      where: { id: site.id },
      data: {
        subdomain: nextSubdomain,
        customDomain,
        customDomainStatus: customDomain ? "Waiting for DNS" : null,
      },
    });
    revalidatePath(pathFor(nextSubdomain, "/domain"));
    return redirectWithToast(pathFor(nextSubdomain, "/domain"), "success", "Saved.");
  } else if (kind === "money") {
    await prisma.site.update({
      where: { id: site.id },
      data: {
        tipButton: formData.get("tipButton") === "on",
        tipEth: formData.get("tipEth") === "on",
        tipUsdc: formData.get("tipUsdc") === "on",
        payoutWallet: emptyToNull(formData.get("payoutWallet")),
      },
    });
  } else if (kind === "settings") {
    const reviewMode = String(formData.get("reviewMode") ?? "");
    if (reviewMode !== "AUTO_PUBLISH" && reviewMode !== "REVIEW") {
      return redirectWithToast(pathFor(site.subdomain, "/settings"), "error", "Choose a publishing mode.");
    }
    await prisma.site.update({
      where: { id: site.id },
      data: {
        reviewMode,
        privateSite: formData.get("privateSite") === "on",
        previewNoindex: formData.get("previewNoindex") === "on",
      },
    });
  } else if (kind === "pause") {
    const current = await prisma.site.findUnique({ where: { id: site.id }, select: { status: true } });
    await prisma.site.update({
      where: { id: site.id },
      data: {
        status: current?.status === "PAUSED" ? "ACTIVE" : "PAUSED",
        pausedReason: current?.status === "PAUSED" ? null : "paused",
      },
    });
  } else if (kind === "changelog") {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!title || !body) {
      return redirectWithToast(pathFor(site.subdomain, "/changelog"), "error", "Title and body are required.");
    }
    await prisma.worklogEntry.create({
      data: { siteId: site.id, title: title.slice(0, 160), body: body.slice(0, 8_000), source: "manual" },
    });
  }
  revalidatePath(pathFor(site.subdomain, section));
  return redirectWithToast(pathFor(site.subdomain, section || ""), "success", "Saved.");
}

export async function deleteWorkspaceAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!session) redirect(`/login?next=${pathFor(subdomain, "/settings")}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) return redirectWithToast(pathFor(subdomain, "/settings"), "error", "The database is not connected.");
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: session.userId },
    select: { id: true, name: true },
  });
  if (!site) return redirectWithToast("/dashboard", "error", "Site not found.");
  if (confirm !== site.name) {
    return redirectWithToast(pathFor(subdomain, "/settings"), "error", "Type the workspace name.");
  }
  await prisma.site.delete({ where: { id: site.id } });
  revalidatePath("/dashboard");
  return redirectWithToast("/dashboard", "success", "Deleted.");
}

function imageSaveMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const reason =
    error !== null && typeof error === "object" && "reason" in error
      ? String((error as { reason?: unknown }).reason)
      : "";
  if (name === "ProfileStorageUnconfigured" || error instanceof ProfileStorageUnconfigured) {
    return "Image uploads are not configured. Set BLOB_READ_WRITE_TOKEN.";
  }
  if (name === "BrandImageError" || error instanceof BrandImageError || reason === "size" || reason === "type") {
    return reason === "size" ? "Images must be 2 MB or smaller." : "Use a PNG, JPEG, WebP, or ICO image.";
  }
  if (error instanceof Error && error.message.startsWith("Vercel Blob:")) {
    return error.message.replace(/^Vercel Blob:\s*/, "Image storage failed. ");
  }
  if (error instanceof Error && error.message.includes("received no file bytes")) return error.message;
  return "Could not save the images.";
}

function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function describeFormValue(value: FormDataEntryValue) {
  if (typeof value === "string") return { kind: "text", length: value.length };
  return {
    kind: value.constructor?.name ?? "blob",
    name: "name" in value ? value.name : "",
    type: value.type,
    size: value.size,
    readable: typeof value.arrayBuffer === "function",
  };
}

function uploadedBlob(formData: FormData, name: string): Blob | null {
  let best: Blob | null = null;
  for (const value of formData.getAll(name)) {
    if (typeof value === "string" || typeof value.arrayBuffer !== "function" || value.size <= 0) continue;
    if (!best || value.size > best.size) best = value;
  }
  return best;
}

async function nextBrandUrl(args: {
  siteId: string;
  slot: "logo-light" | "logo-dark" | "favicon";
  field: "logoLight" | "logoDark" | "favicon";
  formData: FormData;
  remove: boolean;
  current: string | null;
  created: string[];
}): Promise<{ url: string | null; retire: string | null }> {
  const entries = args.formData.getAll(args.field).map(describeFormValue);
  const file = uploadedBlob(args.formData, args.field);
  const chosen = args.formData.get(`${args.field}Chosen`) === "1";
  console.info("[branding] file", {
    field: args.field,
    chosen,
    remove: args.remove,
    hadUrl: Boolean(args.current),
    entries,
  });
  if (chosen && !file) {
    throw new Error(`${args.field} was selected in the browser, but the server received no file bytes.`);
  }
  if (file) {
    const stored = await uploadSiteBrandImage({ siteId: args.siteId, slot: args.slot, file });
    args.created.push(stored.url);
    console.info("[branding] stored", { field: args.field, url: stored.url });
    return { url: stored.url, retire: args.current };
  }
  if (args.remove) {
    console.info("[branding] removed", { field: args.field });
    return { url: null, retire: args.current };
  }
  console.info("[branding] unchanged", { field: args.field });
  return { url: args.current, retire: null };
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function approveDocsPlanAction(formData: FormData) {
  const session = await getViewSession();
  const siteId = String(formData.get("siteId") ?? "");
  const subdomain = String(formData.get("subdomain") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const productRoot = String(formData.get("productRoot") ?? "");
  const back = pathFor(subdomain);
  if (!session) redirect(`/login?next=${back}`);
  await blockActAsWrites();
  const prisma = getPrisma();
  if (!prisma) return redirectWithToast(back, "error", "The database is not connected.");
  const site = await ownedSite(siteId, session.userId);
  if (!site?.repoId) return redirectWithToast(back, "error", "Site not found.");
  const job = await prisma.job.findFirst({
    where: { id: jobId, repoId: site.repoId, status: "WAITING" },
  });
  if (!job) return redirectWithToast(back, "error", "That outline is no longer waiting.");
  const stored = readStoredPlan(job.payload);
  if (!stored) return redirectWithToast(back, "error", "That outline could not be read.");
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get("planJson") ?? ""));
  } catch {
    return redirectWithToast(back, "error", "The outline was not valid.");
  }
  if (!Array.isArray(submitted)) return redirectWithToast(back, "error", "The outline was not valid.");
  const accepted = acceptOwnerPlan({
    base: stored.pages,
    submitted: submitted.flatMap((page) => {
      if (!page || typeof page !== "object") return [];
      const raw = page as { slug?: unknown; title?: unknown; section?: unknown; description?: unknown };
      return [{
        slug: typeof raw.slug === "string" ? raw.slug : "",
        title: typeof raw.title === "string" ? raw.title : "",
        section: typeof raw.section === "string" ? raw.section : "",
        description: typeof raw.description === "string" ? raw.description : "",
      }];
    }),
  });
  if (!accepted.ok) return redirectWithToast(back, "error", accepted.error);
  const replan = productRoot !== stored.productRoot;
  const previous = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload : {};
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      phase: "QUEUED",
      progress: 0,
      detail: replan ? "Planning the selected product" : "Writing the approved outline",
      availableAt: new Date(),
      lockedBy: null,
      leaseUntil: null,
      payload: {
        ...previous,
        docsPlan: {
          ...stored,
          approved: !replan,
          replan,
          productRoot,
          pages: replan ? stored.pages : accepted.plan,
        },
      },
    },
  });
  revalidatePath(back);
  return redirectWithToast(back, "success", replan ? "Planning that product." : "Outline approved.");
}
