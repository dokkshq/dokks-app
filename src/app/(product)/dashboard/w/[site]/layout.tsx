import { notFound, redirect } from "next/navigation";
import { LowBalanceBanner } from "@/components/credits/low-balance";
import { WorkspaceShell } from "@/components/workspace/shell";
import { getViewSession } from "@/lib/admin/act-as";
import { loadCurrentUser } from "@/lib/profile/user";
import { loadWorkspaceShell, loadWorkspaces } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ site: string }>;
}) {
  const session = await getViewSession();
  if (!session) redirect("/login?next=/dashboard");
  const { site: subdomain } = await params;
  const [site, sites, user] = await Promise.all([
    loadWorkspaceShell(session, subdomain),
    loadWorkspaces(session),
    loadCurrentUser(session),
  ]);
  if (!site) notFound();
  return (
    <WorkspaceShell
      user={user}
      site={{
        subdomain: site.subdomain,
        name: site.name,
        owner: site.owner,
        repo: site.repo,
        host: site.host,
        status: site.status,
        reviewMode: site.reviewMode,
        hasRepo: site.hasRepo,
      }}
      sites={sites.map((item) => ({
        subdomain: item.subdomain,
        owner: item.hasRepo ? item.owner : item.name,
        name: item.name,
      }))}
      counts={{ pages: site.pages, changelog: site.changelog }}
      banner={<LowBalanceBanner userId={session.userId} />}
    >
      {children}
    </WorkspaceShell>
  );
}
