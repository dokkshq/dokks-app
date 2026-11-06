import { getPrisma } from "@/lib/db";
import { docsRootDomain } from "@/lib/config";
import type { Session } from "@/lib/session";

export type ManagedJob = {
  id: string;
  kind: string;
  status: string;
  phase: string;
  progress: number;
  detail: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ManagedRevision = {
  id: string;
  slug: string;
  title: string;
  action: string;
  source: string;
  status: string;
  changeNote: string | null;
  createdAt: string;
};

export type ManagedSite = {
  id: string;
  name: string;
  subdomain: string;
  description: string | null;
  status: "PENDING" | "ACTIVE" | "PAUSED";
  pausedReason: string | null;
  reviewMode: "AUTO_PUBLISH" | "REVIEW";
  theme: "LEDGER" | "MINIMAL";
  primaryColor: string;
  publicUrl: string;
  pageCount: number;
  publishedPageCount: number;
  pendingRevisionCount: number;
  pages: Array<{
    id: string;
    slug: string;
    title: string;
    published: boolean;
    handEdited: boolean;
    navOrder: number;
  }>;
  pendingRevisions: ManagedRevision[];
  recentJobs: ManagedJob[];
};

export async function loadManagedSite(
  session: Session,
  siteId: string,
): Promise<ManagedSite | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: session.userId },
    include: {
      repo: { select: { id: true } },
      pages: {
        orderBy: [{ navOrder: "asc" }, { title: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          published: true,
          handEdited: true,
          navOrder: true,
        },
      },
      revisions: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          slug: true,
          title: true,
          action: true,
          source: true,
          status: true,
          changeNote: true,
          createdAt: true,
        },
      },
    },
  });
  if (!site) return null;
  const recentJobs = site.repo
    ? await prisma.job.findMany({
        where: { repoId: site.repo.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          kind: true,
          status: true,
          phase: true,
          progress: true,
          detail: true,
          error: true,
          attempts: true,
          maxAttempts: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
      })
    : [];
  return {
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    description: site.description,
    status: site.status,
    pausedReason: site.pausedReason,
    reviewMode: site.reviewMode,
    theme: site.theme,
    primaryColor: site.primaryColor,
    publicUrl: `https://${site.subdomain}.${docsRootDomain()}`,
    pageCount: site.pages.length,
    publishedPageCount: site.pages.filter((page) => page.published).length,
    pendingRevisionCount: site.revisions.length,
    pages: site.pages,
    pendingRevisions: site.revisions.map((revision) => ({
      ...revision,
      createdAt: revision.createdAt.toISOString(),
    })),
    recentJobs: recentJobs.map(mapJob),
  };
}

export async function loadBuild(
  session: Session,
  siteId: string,
  jobId: string,
) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      repo: { site: { id: siteId, ownerId: session.userId } },
    },
    include: {
      repo: { select: { fullName: true, site: { select: { id: true, name: true, subdomain: true } } } },
      events: { orderBy: { sequence: "asc" } },
      revisions: {
        where: { status: "PENDING" },
        select: { id: true, slug: true, title: true, action: true, source: true },
      },
    },
  });
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    detail: job.detail,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    repoFullName: job.repo.fullName,
    site: job.repo.site,
    pendingRevisions: job.revisions.map((revision) => ({
      id: revision.id,
      slug: revision.slug,
      title: revision.title,
      action: revision.action,
      source: revision.source,
    })),
    events: job.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      level: event.level,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function loadRevision(
  session: Session,
  siteId: string,
  revisionId: string,
) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const revision = await prisma.pageRevision.findFirst({
    where: {
      id: revisionId,
      siteId,
      site: { ownerId: session.userId },
    },
    include: {
      page: {
        select: {
          content: true,
          title: true,
          description: true,
          published: true,
        },
      },
      site: { select: { id: true, name: true, subdomain: true } },
      job: { select: { id: true, kind: true, status: true } },
    },
  });
  if (!revision) return null;
  return {
    id: revision.id,
    slug: revision.slug,
    title: revision.title,
    description: revision.description,
    section: revision.section,
    content: revision.content,
    action: revision.action,
    source: revision.source,
    status: revision.status,
    changeNote: revision.changeNote,
    reviewNote: revision.reviewNote,
    createdAt: revision.createdAt.toISOString(),
    site: revision.site,
    job: revision.job,
    current: revision.page,
  };
}

export async function loadChatView(
  session: Session,
  siteId: string,
  selectedSlug: string | null,
) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { id: siteId, ownerId: session.userId },
    include: {
      repo: { select: { fullName: true } },
      pages: {
        orderBy: [{ navOrder: "asc" }, { title: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          published: true,
          handEdited: true,
          navOrder: true,
        },
      },
      chatEdits: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          page: { select: { title: true, slug: true } },
          job: {
            select: {
              id: true,
              status: true,
              error: true,
              revisions: {
                where: { status: "PENDING" },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!site) return null;
  const selected =
    site.pages.find((page) => page.slug === selectedSlug) ??
    site.pages[0] ??
    null;
  return {
    id: site.id,
    name: site.name,
    repoFullName: site.repo?.fullName ?? "No repository",
    pages: site.pages,
    selected,
    history: site.chatEdits.map((edit) => ({
      id: edit.id,
      instruction: edit.instruction,
      createdAt: edit.createdAt.toISOString(),
      pageTitle: edit.page?.title ?? "Removed page",
      jobId: edit.job?.id ?? null,
      jobStatus: edit.job?.status ?? null,
      jobError: edit.job?.error ?? null,
      pendingRevisionId: edit.job?.revisions[0]?.id ?? null,
    })),
  };
}

function mapJob(job: {
  id: string;
  kind: string;
  status: string;
  phase: string;
  progress: number;
  detail: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): ManagedJob {
  return {
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
