import { notFound } from "next/navigation";
import { retryBuildAction } from "@/app/(product)/dashboard/w/[site]/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewSession } from "@/lib/admin/act-as";
import { jobKindLabel } from "@/lib/format";
import { jobFailureReason } from "@/lib/workspace/jobs";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function BuildsSection({ params }: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return null;
  const site = await loadWorkspace(session, (await params).site);
  if (!site) notFound();
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl">Builds</h1>
      {!site.hasRepo ? (
        <p className="text-sm text-muted-foreground">Import a repository to start the first build.</p>
      ) : null}
      <div className="overflow-hidden rounded-control border border-border">
        {site.jobs.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">None</p> : null}
        {site.jobs.map((job) => (
          <div key={job.id} className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">{jobKindLabel(job.kind)}</p>
                <p className="text-xs text-muted-foreground">
                  {job.createdAt.slice(0, 16).replace("T", " ")}
                  {job.phase ? ` · ${job.phase}` : ""}
                  {job.status === "RUNNING" || job.status === "QUEUED" ? ` · ${job.progress}%` : ""}
                </p>
                {job.detail && job.status !== "FAILED" ? (
                  <p className="text-xs text-muted-foreground">{job.detail}</p>
                ) : null}
                {job.status === "FAILED" ? (
                  <p className="text-xs text-destructive">{jobFailureReason(job)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{job.status}</span>
                {job.status === "FAILED" ? (
                  <form action={retryBuildAction}>
                    <input type="hidden" name="siteId" value={site.id} />
                    <input type="hidden" name="subdomain" value={site.subdomain} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="returnTo" value={`/dashboard/w/${site.subdomain}/builds`} />
                    <SubmitButton size="sm" variant="outline">
                      Retry
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>
            {job.events.length > 0 ? (
              <div className="rounded-control border border-border bg-muted/30 px-3 py-2">
                <ul className="flex flex-col gap-1">
                  {job.events.slice(-8).map((event) => (
                    <li
                      key={event.id}
                      className={
                        event.level === "error"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {event.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
