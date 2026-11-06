import { docsRootDomain } from "@/lib/config";
import { getPrisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import type { WorkspaceJob } from "@/lib/workspace/jobs";

export type { WorkspaceJob, WorkspaceJobEvent } from "@/lib/workspace/jobs";
export { jobFailureReason } from "@/lib/workspace/jobs";

export type WorkspacePage = {
  id: string;
  slug: string;
  title: string;
  section: string | null;
  published: boolean;
  content: string;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  subdomain: string;
  description: string | null;
  status: "PENDING" | "ACTIVE" | "PAUSED";
  reviewMode: "AUTO_PUBLISH" | "REVIEW";
  theme: "LEDGER" | "MINIMAL";
  appearance: "SYSTEM" | "LIGHT" | "DARK";
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  logoHref: string | null;
  privateSite: boolean;
  previewNoindex: boolean;
  tipButton: boolean;
  tipEth: boolean;
  tipUsdc: boolean;
  payoutWallet: string | null;
  customDomain: string | null;
  customDomainStatus: string | null;
  hasRepo: boolean;
  ownerLogin: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  branch: string;
  publicHost: string;
  pages: WorkspacePage[];
  pending: Array<{
    id: string;
    slug: string;
    title: string;
    section: string | null;
    content: string;
    changeNote: string | null;
  }>;
  jobs: WorkspaceJob[];
  activeJob: WorkspaceJob | null;
  chats: Array<{
    id: string;
    instruction: string;
    createdAt: string;
    status: string | null;
    error: string | null;
  }>;
  changelog: Array<{
    id: string;
    title: string;
    body: string;
    publishedAt: string;
    source: string;
  }>;
};

function readEventMeta(metadata: unknown, message: string): {
  role: "thought" | "say" | "action" | "reply" | "note";
  body: string | null;
  explored?: number;
  searches?: number;
  edited?: number;
} {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { role: "note", body: null };
  }
  const record = metadata as {
    role?: unknown;
    body?: unknown;
    explored?: unknown;
    searches?: unknown;
    edited?: unknown;
  };
  const role =
    record.role === "thought" || record.role === "say" || record.role === "action" || record.role === "reply"
      ? record.role
      : "note";
  const body = typeof record.body === "string" && record.body.trim() && record.body.trim() !== message.trim()
    ? record.body.trim()
    : null;
  return {
    role,
    body,
    explored: typeof record.explored === "number" ? record.explored : undefined,
    searches: typeof record.searches === "number" ? record.searches : undefined,
    edited: typeof record.edited === "number" ? record.edited : undefined,
  };
}

export async function loadWorkspaces(session: Session) {
  const prisma = getPrisma();
  if (!prisma) return [];
  const sites = await prisma.site.findMany({
    where: { ownerId: session.userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      subdomain: true,
      status: true,
      repo: { select: { owner: true, name: true, fullName: true } },
      _count: { select: { pages: true } },
    },
  });
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    status: site.status,
    owner: site.repo?.owner ?? site.name,
    repo: site.repo?.name ?? "No repo",
    fullName: site.repo?.fullName ?? "No repository",
    hasRepo: Boolean(site.repo),
    pages: site._count.pages,
    host: `${site.subdomain}.${docsRootDomain()}`,
  }));
}

export async function loadWorkspaceActivity(
  session: Session,
  subdomain: string,
): Promise<WorkspaceJob[] | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { subdomain, ownerId: session.userId },
    select: { repoId: true },
  });
  if (!site) return null;
  if (!site.repoId) return [];
  const jobs = await prisma.job.findMany({
    where: { repoId: site.repoId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      kind: true,
      status: true,
      phase: true,
      progress: true,
      detail: true,
      error: true,
      createdAt: true,
      finishedAt: true,
      events: {
        orderBy: { sequence: "asc" },
        take: 120,
        select: {
          id: true,
          sequence: true,
          level: true,
          message: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });
  return jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    detail: job.detail,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    events: job.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      level: event.level,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      ...readEventMeta(event.metadata, event.message),
    })),
  }));
}

export async function loadWorkspaceShell(session: Session, subdomain: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { subdomain, ownerId: session.userId },
    select: {
      name: true,
      subdomain: true,
      status: true,
      reviewMode: true,
      repo: { select: { owner: true, name: true } },
      _count: { select: { pages: true, worklog: true } },
    },
  });
  if (!site) return null;
  return {
    subdomain: site.subdomain,
    name: site.name,
    owner: site.repo?.owner ?? site.name,
    repo: site.repo?.name ?? "No repo",
    host: `${site.subdomain}.${docsRootDomain()}`,
    status: site.status,
    reviewMode: site.reviewMode,
    hasRepo: Boolean(site.repo),
    pages: site._count.pages,
    changelog: site._count.worklog,
  };
}

export async function loadWorkspaceBranding(session: Session, subdomain: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { subdomain, ownerId: session.userId },
    select: {
      id: true,
      name: true,
      subdomain: true,
      theme: true,
      appearance: true,
      primaryColor: true,
      logoLightUrl: true,
      logoDarkUrl: true,
      faviconUrl: true,
      pages: {
        orderBy: [{ navOrder: "asc" }, { title: "asc" }],
        take: 8,
        select: { slug: true, title: true, section: true },
      },
    },
  });
  if (!site) return null;
  return {
    ...site,
    host: `${site.subdomain}.${docsRootDomain()}`,
  };
}

export async function loadWorkspace(
  session: Session,
  subdomain: string,
): Promise<WorkspaceRecord | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const site = await prisma.site.findFirst({
    where: { subdomain, ownerId: session.userId },
    include: {
      owner: { select: { login: true } },
      repo: { select: { id: true, owner: true, name: true, fullName: true, defaultBranch: true } },
      pages: { orderBy: [{ navOrder: "asc" }, { title: "asc" }] },
      revisions: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
      worklog: { orderBy: { publishedAt: "desc" }, take: 30 },
      chatEdits: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { job: { select: { status: true, error: true } } },
      },
    },
  });
  if (!site) return null;
  const jobs = site.repoId
    ? await prisma.job.findMany({
        where: { repoId: site.repoId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          kind: true,
          status: true,
          phase: true,
          progress: true,
          detail: true,
          error: true,
          createdAt: true,
          finishedAt: true,
          events: {
            orderBy: { sequence: "asc" },
            take: 120,
            select: {
              id: true,
              sequence: true,
              level: true,
              message: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      })
    : [];
  const mappedJobs: WorkspaceJob[] = jobs.map((job) => ({
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    detail: job.detail,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    events: job.events.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      level: event.level,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      ...readEventMeta(event.metadata, event.message),
    })),
  }));
  const activeJob =
    mappedJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING") ??
    mappedJobs.find((job) => job.status === "FAILED") ??
    null;
  return {
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    description: site.description,
    status: site.status,
    reviewMode: site.reviewMode,
    theme: site.theme,
    appearance: site.appearance,
    primaryColor: site.primaryColor,
    logoLightUrl: site.logoLightUrl,
    logoDarkUrl: site.logoDarkUrl,
    faviconUrl: site.faviconUrl,
    logoHref: site.logoHref,
    privateSite: site.privateSite,
    previewNoindex: site.previewNoindex,
    tipButton: site.tipButton,
    tipEth: site.tipEth,
    tipUsdc: site.tipUsdc,
    payoutWallet: site.payoutWallet,
    customDomain: site.customDomain,
    customDomainStatus: site.customDomainStatus,
    hasRepo: Boolean(site.repo),
    ownerLogin: site.owner.login,
    repoOwner: site.repo?.owner ?? site.name,
    repoName: site.repo?.name ?? "No repo",
    repoFullName: site.repo?.fullName ?? "No repository",
    branch: site.repo?.defaultBranch ?? "main",
    publicHost: `${site.subdomain}.${docsRootDomain()}`,
    pages: site.pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      section: page.section,
      published: page.published,
      content: page.content,
    })),
    pending: site.revisions.map((revision) => ({
      id: revision.id,
      slug: revision.slug,
      title: revision.title,
      section: revision.section,
      content: revision.content,
      changeNote: revision.changeNote,
    })),
    jobs: mappedJobs,
    activeJob,
    chats: site.chatEdits.map((chat) => ({
      id: chat.id,
      instruction: chat.instruction,
      createdAt: chat.createdAt.toISOString(),
      status: chat.job?.status ?? null,
      error: chat.job?.error ?? null,
    })),
    changelog: site.worklog.map((entry) => ({
      id: entry.id,
      title: entry.title,
      body: entry.body,
      publishedAt: entry.publishedAt.toISOString(),
      source: entry.source,
    })),
  };
}
