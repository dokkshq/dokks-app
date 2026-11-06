import { getPrisma } from "@/lib/db";
import { sampleSite } from "@/lib/sites/sample";
import type { Session } from "@/lib/session";

export type SiteCard = {
  id: string;
  name: string;
  subdomain: string;
  status: "PENDING" | "ACTIVE" | "PAUSED";
  theme: "LEDGER" | "MINIMAL";
  primaryColor: string;
  pageCount: number;
  pendingReviews: number;
  latestBuildStatus: string | null;
  preview: boolean;
};

export type WorklogCard = {
  id: string;
  siteName: string;
  title: string;
  body: string;
  publishedAt: string;
  preview: boolean;
};

export type UsageSummary = {
  sites: number;
  pages: number;
  builds: number;
  connected: boolean;
};

export type PlanCard = {
  tier: "FREE" | "PRO" | "TEAM";
  name: string;
  priceCents: number;
  customDomain: boolean;
  dailyRepoCapUsd: number;
};

const FALLBACK_PLANS: PlanCard[] = [
  { tier: "FREE", name: "Free", priceCents: 0, customDomain: false, dailyRepoCapUsd: 6 },
  { tier: "PRO", name: "Pro", priceCents: 2000, customDomain: true, dailyRepoCapUsd: 10 },
  { tier: "TEAM", name: "Team", priceCents: 20000, customDomain: true, dailyRepoCapUsd: 40 },
];

export async function loadSiteCards(session: Session): Promise<{
  sites: SiteCard[];
  connected: boolean;
}> {
  const prisma = getPrisma();
  if (!prisma || session.userId === "dev_preview") {
    if (!prisma) {
      const sample = sampleSite();
      return {
        connected: false,
        sites: [
          {
            id: sample.id,
            name: sample.name,
            subdomain: sample.subdomain,
            status: sample.status,
            theme: sample.theme,
            primaryColor: sample.primaryColor,
            pageCount: sample.pages.length,
            pendingReviews: 0,
            latestBuildStatus: null,
            preview: true,
          },
        ],
      };
    }
  }
  try {
    const sites = await prisma.site.findMany({
      where: { ownerId: session.userId },
      include: {
        _count: { select: { pages: true } },
        revisions: {
          where: { status: "PENDING" },
          select: { id: true },
        },
        repo: {
          select: {
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      connected: true,
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        subdomain: site.subdomain,
        status: site.status,
        theme: site.theme,
        primaryColor: site.primaryColor,
        pageCount: site._count.pages,
        pendingReviews: site.revisions.length,
        latestBuildStatus: site.repo?.jobs[0]?.status ?? null,
        preview: false,
      })),
    };
  } catch {
    return { connected: false, sites: [] };
  }
}

export async function loadWorklog(session: Session): Promise<{
  entries: WorklogCard[];
  connected: boolean;
}> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      connected: false,
      entries: [
        {
          id: "preview_worklog",
          siteName: "Sample",
          title: "Preview entry",
          body: "This Changelog entry is preview data. It is shown when the database is not connected.",
          publishedAt: "2026-10-23T00:00:00.000Z",
          preview: true,
        },
      ],
    };
  }
  try {
    const entries = await prisma.worklogEntry.findMany({
      where: { site: { ownerId: session.userId } },
      include: { site: true },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
    return {
      connected: true,
      entries: entries.map((entry) => ({
        id: entry.id,
        siteName: entry.site.name,
        title: entry.title,
        body: entry.body,
        publishedAt: entry.publishedAt.toISOString(),
        preview: false,
      })),
    };
  } catch {
    return { connected: false, entries: [] };
  }
}

export async function loadUsage(session: Session): Promise<UsageSummary> {
  const prisma = getPrisma();
  if (!prisma) {
    const sample = sampleSite();
    return { sites: 1, pages: sample.pages.length, builds: 0, connected: false };
  }
  try {
    const [sites, pages, builds] = await Promise.all([
      prisma.site.count({ where: { ownerId: session.userId } }),
      prisma.page.count({ where: { site: { ownerId: session.userId }, published: true } }),
      prisma.job.count({ where: { repo: { site: { ownerId: session.userId } } } }),
    ]);
    return { sites, pages, builds, connected: true };
  } catch {
    return { sites: 0, pages: 0, builds: 0, connected: false };
  }
}

export async function loadPlans(): Promise<PlanCard[]> {
  const prisma = getPrisma();
  if (!prisma) return FALLBACK_PLANS;
  try {
    const plans = await prisma.plan.findMany({ orderBy: { priceCents: "asc" } });
    if (plans.length === 0) return FALLBACK_PLANS;
    return plans.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      priceCents: plan.priceCents,
      customDomain: plan.customDomain,
      dailyRepoCapUsd: Number(plan.dailyRepoCapUsd),
    }));
  } catch {
    return FALLBACK_PLANS;
  }
}

export type AdminSnapshot = {
  connected: boolean;
  users: Array<{ id: string; login: string; email: string | null; role: string; createdAt: string }>;
  jobs: Array<{
    id: string;
    repo: string;
    kind: string;
    status: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: string;
    createdAt: string;
  }>;
  feedback: Array<{ id: string; message: string; createdAt: string }>;
  invites: Array<{ id: string; email: string; wave: number; sentAt: string | null; acceptedAt: string | null }>;
  installs: Array<{ id: string; accountLogin: string; accountType: string; uninstalledAt: string | null; repoCount: number }>;
  plans: PlanCard[];
};

export async function loadAdminSnapshot(): Promise<AdminSnapshot> {
  const empty: AdminSnapshot = {
    connected: false,
    users: [],
    jobs: [],
    feedback: [],
    invites: [],
    installs: [],
    plans: await loadPlans(),
  };
  const prisma = getPrisma();
  if (!prisma) return empty;
  try {
    const [users, jobs, feedback, invites, installs, plans] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.job.findMany({
        include: { repo: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.betaInvite.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.installation.findMany({
        include: { _count: { select: { repos: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      loadPlans(),
    ]);
    return {
      connected: true,
      users: users.map((row) => ({
        id: row.id,
        login: row.login,
        email: row.email,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      })),
      jobs: jobs.map((row) => ({
        id: row.id,
        repo: row.repo.fullName,
        kind: row.kind,
        status: row.status,
        provider: row.provider,
        model: row.model,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        estimatedCostUsd: Number(row.estimatedCostUsd).toFixed(4),
        createdAt: row.createdAt.toISOString(),
      })),
      feedback: feedback.map((row) => ({
        id: row.id,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      })),
      invites: invites.map((row) => ({
        id: row.id,
        email: row.email,
        wave: row.wave,
        sentAt: row.sentAt?.toISOString() ?? null,
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
      })),
      installs: installs.map((row) => ({
        id: row.id,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        uninstalledAt: row.uninstalledAt?.toISOString() ?? null,
        repoCount: row._count.repos,
      })),
      plans,
    };
  } catch {
    return empty;
  }
}
