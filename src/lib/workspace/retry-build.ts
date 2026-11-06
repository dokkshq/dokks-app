import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { assertCredits } from "@/lib/credits/apply";
import { getPrisma } from "@/lib/db";
import type { Session } from "@/lib/session";
import { retryFailedJob } from "@/worker/queue";

export type RetryBuildResult =
  | { ok: true; subdomain: string }
  | { ok: false; error: string; subdomain: string | null };

export async function retryWorkspaceBuild(args: {
  session: Session;
  siteId: string;
  jobId: string;
}): Promise<RetryBuildResult> {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "The database is not connected.", subdomain: null };

  const site = await prisma.site.findFirst({
    where: { id: args.siteId, ownerId: args.session.userId },
    select: { id: true, subdomain: true, status: true },
  });
  if (!site) return { ok: false, error: "Site not found.", subdomain: null };
  if (site.status === "PAUSED") {
    return { ok: false, error: "This site is paused.", subdomain: site.subdomain };
  }

  const credits = await assertCredits(args.session.userId);
  if (!credits.ok) return { ok: false, error: credits.error, subdomain: site.subdomain };

  const job = await prisma.job.findFirst({
    where: {
      id: args.jobId,
      repo: { site: { id: site.id, ownerId: args.session.userId } },
    },
    select: { id: true, kind: true, repoId: true, status: true },
  });
  if (!job) return { ok: false, error: "That build no longer exists.", subdomain: site.subdomain };
  if (job.status !== "FAILED") {
    return { ok: false, error: "Only failed builds can be retried.", subdomain: site.subdomain };
  }

  const retried = await retryFailedJob(job.id).catch(() => false);
  if (!retried) {
    return { ok: false, error: "Could not queue that build. Try again.", subdomain: site.subdomain };
  }

  await logActivity({
    actorId: args.session.userId,
    actorEmail: args.session.login,
    action: "site.job-retry",
    targetType: "job",
    targetId: job.id,
    metadata: {
      kind: job.kind,
      repoId: job.repoId,
      siteId: site.id,
    },
  });

  revalidatePath(`/dashboard/w/${site.subdomain}`);
  revalidatePath(`/dashboard/w/${site.subdomain}/builds`);
  revalidatePath("/dashboard");
  return { ok: true, subdomain: site.subdomain };
}
