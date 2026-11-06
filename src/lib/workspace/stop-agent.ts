import { getPrisma } from "@/lib/db";

export async function stopSiteAgent(args: {
  siteId: string;
  ownerId: string;
}): Promise<{ ok: true; subdomain: string; stopped: number } | { ok: false; error: string }> {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "The database is not connected." };
  const site = await prisma.site.findFirst({
    where: { id: args.siteId, ownerId: args.ownerId },
    select: { subdomain: true, repoId: true },
  });
  if (!site) return { ok: false, error: "Site not found." };
  if (!site.repoId) return { ok: true, subdomain: site.subdomain, stopped: 0 };
  const jobs = await prisma.job.findMany({
    where: { repoId: site.repoId, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (jobs.length === 0) return { ok: true, subdomain: site.subdomain, stopped: 0 };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.job.updateMany({
      where: {
        id: { in: jobs.map((job) => job.id) },
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        detail: "Stopped",
        error: null,
        finishedAt: now,
        lockedBy: null,
        leaseUntil: null,
      },
    });
    for (const job of jobs) {
      const last = await tx.jobEvent.findFirst({
        where: { jobId: job.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      await tx.jobEvent.create({
        data: {
          jobId: job.id,
          sequence: (last?.sequence ?? 0) + 1,
          level: "info",
          message: "Stopped.",
          metadata: { role: "reply" },
        },
      });
      await tx.usageEntry.deleteMany({ where: { jobId: job.id, status: "RESERVED" } });
    }
  });
  return { ok: true, subdomain: site.subdomain, stopped: jobs.length };
}
