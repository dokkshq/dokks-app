import { getPrisma } from "@/lib/db";
import { installationVisibleWhere } from "@/lib/github/installation-access";
import { DEFAULT_HEAVY_MODEL } from "@/lib/copilot/models";
import type { ImportStore } from "@/lib/import/repo-import";
import type { AttachRepoStore } from "@/lib/workspace/attach-repo";
import type { CreateWorkspaceStore } from "@/lib/workspace/create";

export function createPrismaImportStore(): ImportStore | null {
  const prisma = getPrisma();
  if (!prisma) return null;
  return {
    async findRepoForUser(repoId, userId) {
      const repo = await prisma.repo.findFirst({
        where: {
          id: repoId,
          installation: installationVisibleWhere(userId),
        },
        select: {
          id: true,
          githubRepoId: true,
          owner: true,
          name: true,
          fullName: true,
          archived: true,
          removed: true,
          site: { select: { id: true, subdomain: true } },
        },
      });
      if (!repo) return null;
      return {
        id: repo.id,
        githubRepoId: repo.githubRepoId,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        archived: repo.archived,
        removed: repo.removed,
        siteId: repo.site?.id ?? null,
        siteSubdomain: repo.site?.subdomain ?? null,
      };
    },
    async subdomainTaken(subdomain) {
      const row = await prisma.site.findUnique({
        where: { subdomain },
        select: { id: true },
      });
      return Boolean(row);
    },
    async createSiteAndJob(input) {
      return prisma.$transaction(async (tx) => {
        const site = await tx.site.create({
          data: {
            repoId: input.repoId,
            ownerId: input.userId,
            name: input.name,
            subdomain: input.subdomain,
            description: input.description,
            theme: input.theme,
            primaryColor: input.primaryColor,
            reviewMode: input.reviewMode,
            status: "PENDING",
          },
          select: { id: true, subdomain: true },
        });
        const job = await tx.job.create({
          data: {
            repoId: input.repoId,
            kind: "FIRST_BUILD",
            status: "QUEUED",
            provider: "XAI",
            model: DEFAULT_HEAVY_MODEL,
            idempotencyKey: input.idempotencyKey,
            payload: { source: "import" },
          },
          select: { id: true },
        });
        return { siteId: site.id, jobId: job.id, subdomain: site.subdomain };
      });
    },
  };
}

export function createPrismaWorkspaceStore(): (CreateWorkspaceStore & AttachRepoStore) | null {
  const prisma = getPrisma();
  if (!prisma) return null;
  return {
    async subdomainTaken(subdomain) {
      const row = await prisma.site.findUnique({
        where: { subdomain },
        select: { id: true },
      });
      return Boolean(row);
    },
    async createEmptySite(input) {
      const site = await prisma.site.create({
        data: {
          ownerId: input.userId,
          name: input.name,
          subdomain: input.subdomain,
          description: input.description,
          theme: input.theme,
          primaryColor: input.primaryColor,
          reviewMode: input.reviewMode,
          status: "PENDING",
        },
        select: { id: true, subdomain: true },
      });
      return { siteId: site.id, subdomain: site.subdomain };
    },
    async findOwnedEmptySite(siteId, userId) {
      return prisma.site.findFirst({
        where: { id: siteId, ownerId: userId },
        select: { id: true, subdomain: true, repoId: true },
      });
    },
    async findRepoForUser(repoId, userId) {
      const repo = await prisma.repo.findFirst({
        where: {
          id: repoId,
          installation: installationVisibleWhere(userId),
        },
        select: {
          id: true,
          githubRepoId: true,
          owner: true,
          name: true,
          fullName: true,
          archived: true,
          removed: true,
          site: { select: { id: true, subdomain: true } },
        },
      });
      if (!repo) return null;
      return {
        id: repo.id,
        githubRepoId: repo.githubRepoId,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        archived: repo.archived,
        removed: repo.removed,
        siteId: repo.site?.id ?? null,
        siteSubdomain: repo.site?.subdomain ?? null,
      };
    },
    async attachRepoAndQueueBuild(input) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.site.findFirst({
          where: { id: input.siteId, repoId: null },
          select: { id: true, subdomain: true },
        });
        if (!current) {
          throw new Error("This workspace already has a repository.");
        }
        const site = await tx.site.update({
          where: { id: current.id },
          data: { repoId: input.repoId, status: "PENDING" },
          select: { id: true, subdomain: true },
        });
        const existing = await tx.job.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, repoId: true, status: true },
        });
        if (existing?.repoId === input.repoId) {
          if (existing.status === "FAILED" || existing.status === "SUCCEEDED") {
            await tx.job.update({
              where: { id: existing.id },
              data: {
                status: "QUEUED",
                phase: "QUEUED",
                progress: 0,
                detail: "Queued",
                error: null,
                attempts: 0,
                availableAt: new Date(),
                startedAt: null,
                finishedAt: null,
                lockedBy: null,
                leaseUntil: null,
              },
            });
          }
          return { siteId: site.id, jobId: existing.id, subdomain: site.subdomain };
        }
        const job = await tx.job.create({
          data: {
            repoId: input.repoId,
            kind: "FIRST_BUILD",
            status: "QUEUED",
            provider: "XAI",
            model: DEFAULT_HEAVY_MODEL,
            idempotencyKey: input.idempotencyKey,
            payload: { source: "workspace-attach" },
          },
          select: { id: true },
        });
        return { siteId: site.id, jobId: job.id, subdomain: site.subdomain };
      });
    },
  };
}
