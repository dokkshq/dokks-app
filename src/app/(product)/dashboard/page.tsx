import Link from "next/link";
import { getViewSession } from "@/lib/admin/act-as";
import { Button } from "@/components/ui/button";
import { loadWorkspaces } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

const statusLabel = { ACTIVE: "Live", PAUSED: "Paused", PENDING: "Pending" } as const;

export default async function WorkspacesPage() {
  const session = await getViewSession();
  if (!session) return null;
  const sites = await loadWorkspaces(session);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl">Workspaces</h1>
        <Button nativeButton={false} render={<Link href="/dashboard/new" />}>
          New workspace
        </Button>
      </div>
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No workspaces</p>
      ) : (
        <div className="overflow-hidden rounded-control border border-border">
          <div className="grid grid-cols-[1.4fr_1fr_0.6fr_auto] gap-3 border-b border-border px-4 py-2 text-xs tracking-wide text-muted-foreground uppercase max-md:hidden">
            <span>Workspace</span>
            <span>Repo</span>
            <span>Status</span>
            <span />
          </div>
          {sites.map((site) => (
            <div
              key={site.id}
              className="grid items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1.4fr_1fr_0.6fr_auto]"
            >
              <div>
                <p className="text-sm">{site.name}</p>
                <p className="text-xs text-muted-foreground">{site.host}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {site.hasRepo ? site.fullName : "No repository"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <span
                  className={site.status === "ACTIVE" ? "size-1.5 rounded-full bg-live" : "size-1.5 rounded-full bg-muted-foreground"}
                />
                {statusLabel[site.status]}
              </p>
              <Button nativeButton={false} variant="outline" size="sm" render={<Link href={`/dashboard/w/${site.subdomain}`} />}>
                Open workspace
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
