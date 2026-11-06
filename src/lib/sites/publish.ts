import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import type { PageDraft } from "@/lib/copilot/contract";

export type ReviewMode = "AUTO_PUBLISH" | "REVIEW";
export type RevisionSource = "FIRST_BUILD" | "PUSH_UPDATE" | "CHAT_EDIT";

export type ApplyDraftsResult = {
  prepared: number;
  published: number;
  pending: number;
  skipped: number;
  removed: number;
};

const APPLY_DRAFTS_TIMEOUT_MS = 60_000;
const APPLY_DRAFTS_MAX_WAIT_MS = 10_000;
const APPROVE_REVISION_TIMEOUT_MS = 15_000;

export async function applyDrafts(args: {
  siteId: string;
  jobId: string;
  source: RevisionSource;
  reviewMode: ReviewMode;
  baseSha: string | null;
  pages: PageDraft[];
  removedSlugs: string[];
  changeNote: string | null;
}): Promise<ApplyDraftsResult> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is required to publish pages.");
  return prisma.$transaction(
    async (tx) => {
      const site = await tx.site.findUnique({
        where: { id: args.siteId },
        select: { id: true, status: true },
      });
      if (!site) throw new Error("Site not found.");
      if (site.status === "PAUSED") {
        throw new Error("This site is paused.");
      }
      await tx.pageRevision.deleteMany({
        where: { jobId: args.jobId, status: "PENDING" },
      });

      const removedSlugs = args.removedSlugs.filter(
        (slug) => !args.pages.some((page) => page.slug === slug),
      );
      const interestedSlugs = [
        ...new Set([...args.pages.map((page) => page.slug), ...removedSlugs]),
      ];
      const existingPages =
        interestedSlugs.length === 0
          ? []
          : await tx.page.findMany({
              where: { siteId: args.siteId, slug: { in: interestedSlugs } },
            });
      const existingBySlug = new Map(
        existingPages.map((page) => [page.slug, page] as const),
      );

      const publishNow = shouldPublishImmediately({
        reviewMode: args.reviewMode,
        source: args.source,
      });
      const result: ApplyDraftsResult = {
        prepared: 0,
        published: 0,
        pending: 0,
        skipped: 0,
        removed: 0,
      };
      let publishedPages = 0;

      const writableDrafts = args.pages.filter((draft) => {
        const existing = existingBySlug.get(draft.slug);
        if (
          !canWriteGeneratedPage({
            handEdited: existing?.handEdited ?? false,
            source: args.source,
          })
        ) {
          result.skipped += 1;
          return false;
        }
        return true;
      });
      const writableRemovals = removedSlugs.filter((slug) => {
        const existing = existingBySlug.get(slug);
        if (!existing) return false;
        if (
          !canWriteGeneratedPage({
            handEdited: existing.handEdited,
            source: args.source,
          })
        ) {
          result.skipped += 1;
          return false;
        }
        return true;
      });

      const touchSlugs = [
        ...writableDrafts.map((draft) => draft.slug),
        ...writableRemovals,
      ];
      if (touchSlugs.length > 0) {
        await supersedeMany(tx, args.siteId, touchSlugs, "PENDING");
        if (publishNow) {
          await supersedeMany(tx, args.siteId, touchSlugs, "PUBLISHED");
        }
      }

      for (const draft of writableDrafts) {
        const existing = existingBySlug.get(draft.slug);
        result.prepared += 1;
        if (publishNow) {
          const page = existing
            ? await tx.page.update({
                where: { id: existing.id },
                data: {
                  section: draft.section,
                  title: draft.title,
                  description: draft.description,
                  content: draft.content,
                  navOrder: draft.navOrder,
                  published: true,
                },
              })
            : await tx.page.create({
                data: {
                  siteId: args.siteId,
                  slug: draft.slug,
                  section: draft.section,
                  title: draft.title,
                  description: draft.description,
                  content: draft.content,
                  navOrder: draft.navOrder,
                  published: true,
                },
              });
          await tx.pageRevision.create({
            data: revisionData(args, draft, page.id, "PUBLISHED"),
          });
          result.published += 1;
          publishedPages += 1;
        } else {
          await tx.pageRevision.create({
            data: revisionData(args, draft, existing?.id ?? null, "PENDING"),
          });
          result.pending += 1;
        }
      }

      for (const slug of writableRemovals) {
        const existing = existingBySlug.get(slug);
        if (!existing) continue;
        result.prepared += 1;
        if (publishNow) {
          await tx.page.update({
            where: { id: existing.id },
            data: { published: false },
          });
          await tx.pageRevision.create({
            data: deleteRevisionData(args, slug, existing.id, "PUBLISHED"),
          });
          result.published += 1;
        } else {
          await tx.pageRevision.create({
            data: deleteRevisionData(args, slug, existing.id, "PENDING"),
          });
          result.pending += 1;
        }
        result.removed += 1;
      }

      if (publishedPages > 0 && site.status === "PENDING") {
        await tx.site.update({
          where: { id: args.siteId },
          data: { status: "ACTIVE" },
        });
      }
      return result;
    },
    { maxWait: APPLY_DRAFTS_MAX_WAIT_MS, timeout: APPLY_DRAFTS_TIMEOUT_MS },
  );
}

export type PublishRevisionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveRevision(args: {
  revisionId: string;
  ownerId: string;
}): Promise<PublishRevisionResult> {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "The database is not connected." };
  return prisma.$transaction(
    async (tx) => {
      const revision = await tx.pageRevision.findUnique({
        where: { id: args.revisionId },
        include: { site: { select: { ownerId: true, status: true } } },
      });
      if (!revision || revision.site.ownerId !== args.ownerId) {
        return { ok: false, error: "Revision not found." };
      }
      if (revision.status !== "PENDING") {
        return { ok: false, error: "That revision is no longer pending." };
      }
      if (revision.site.status === "PAUSED") {
        return { ok: false, error: "This site is paused." };
      }
      const existing = await tx.page.findUnique({
        where: { siteId_slug: { siteId: revision.siteId, slug: revision.slug } },
      });
      if (
        !canWriteGeneratedPage({
          handEdited: existing?.handEdited ?? false,
          source: revision.source,
        })
      ) {
        return {
          ok: false,
          error: "That page was edited by hand. Reject this revision instead.",
        };
      }
      await supersedeMany(tx, revision.siteId, [revision.slug], "PUBLISHED");
      let pageId = existing?.id ?? null;
      if (revision.action === "DELETE") {
        if (existing) {
          await tx.page.update({
            where: { id: existing.id },
            data: { published: false },
          });
        }
      } else if (existing) {
        await tx.page.update({
          where: { id: existing.id },
          data: {
            section: revision.section,
            title: revision.title,
            description: revision.description,
            content: revision.content,
            navOrder: revision.navOrder,
            published: true,
            handEdited: revision.source === "CHAT_EDIT" ? true : existing.handEdited,
          },
        });
      } else {
        const created = await tx.page.create({
          data: {
            siteId: revision.siteId,
            slug: revision.slug,
            section: revision.section,
            title: revision.title,
            description: revision.description,
            content: revision.content,
            navOrder: revision.navOrder,
            published: true,
            handEdited: revision.source === "CHAT_EDIT",
          },
          select: { id: true },
        });
        pageId = created.id;
      }
      await tx.pageRevision.update({
        where: { id: revision.id },
        data: {
          status: "PUBLISHED",
          pageId,
          publishedAt: new Date(),
          reviewedAt: new Date(),
        },
      });
      if (revision.site.status === "PENDING") {
        await tx.site.update({
          where: { id: revision.siteId },
          data: { status: "ACTIVE" },
        });
      }
      return { ok: true };
    },
    { maxWait: APPLY_DRAFTS_MAX_WAIT_MS, timeout: APPROVE_REVISION_TIMEOUT_MS },
  );
}

export async function rejectRevision(args: {
  revisionId: string;
  ownerId: string;
  note: string | null;
}): Promise<PublishRevisionResult> {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "The database is not connected." };
  const revision = await prisma.pageRevision.findUnique({
    where: { id: args.revisionId },
    include: { site: { select: { ownerId: true } } },
  });
  if (!revision || revision.site.ownerId !== args.ownerId) {
    return { ok: false, error: "Revision not found." };
  }
  if (revision.status !== "PENDING") {
    return { ok: false, error: "That revision is no longer pending." };
  }
  await prisma.pageRevision.update({
    where: { id: revision.id },
    data: {
      status: "REJECTED",
      reviewNote: args.note?.trim().slice(0, 1_000) || null,
      reviewedAt: new Date(),
    },
  });
  return { ok: true };
}

export function canWriteGeneratedPage(args: {
  handEdited: boolean;
  source: RevisionSource;
}): boolean {
  return !args.handEdited || args.source === "CHAT_EDIT";
}

export function shouldPublishImmediately(args: {
  reviewMode: ReviewMode;
  source: RevisionSource;
}): boolean {
  // Generated docs stay an editable draft. Publishing is a separate owner action.
  return false;
}

function revisionData(
  args: {
    siteId: string;
    jobId: string;
    source: RevisionSource;
    baseSha: string | null;
    changeNote: string | null;
  },
  draft: PageDraft,
  pageId: string | null,
  status: "PENDING" | "PUBLISHED",
) {
  return {
    siteId: args.siteId,
    pageId,
    jobId: args.jobId,
    action: "UPSERT" as const,
    status,
    source: args.source,
    slug: draft.slug,
    section: draft.section,
    title: draft.title,
    description: draft.description,
    content: draft.content,
    navOrder: draft.navOrder,
    baseSha: args.baseSha,
    changeNote: args.changeNote,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
  };
}

function deleteRevisionData(
  args: {
    siteId: string;
    jobId: string;
    source: RevisionSource;
    baseSha: string | null;
    changeNote: string | null;
  },
  slug: string,
  pageId: string,
  status: "PENDING" | "PUBLISHED",
) {
  return {
    siteId: args.siteId,
    pageId,
    jobId: args.jobId,
    action: "DELETE" as const,
    status,
    source: args.source,
    slug,
    section: null,
    title: "Remove page",
    description: null,
    content: "",
    navOrder: 0,
    baseSha: args.baseSha,
    changeNote: args.changeNote,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
  };
}

async function supersedeMany(
  tx: Prisma.TransactionClient,
  siteId: string,
  slugs: string[],
  status: "PENDING" | "PUBLISHED",
) {
  if (slugs.length === 0) return;
  await tx.pageRevision.updateMany({
    where: { siteId, slug: { in: slugs }, status },
    data: { status: "SUPERSEDED" },
  });
}
