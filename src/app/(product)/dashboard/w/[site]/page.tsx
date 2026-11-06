import { notFound } from "next/navigation";
import { PreviewChat } from "@/components/workspace/preview-chat";
import { getViewSession } from "@/lib/admin/act-as";
import { docsRootDomain, githubAppInstallUrl } from "@/lib/config";
import { loadImportView } from "@/lib/import/queries";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function WorkspacePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ import?: string; account?: string; q?: string; page?: string }>;
}) {
  const session = await getViewSession();
  if (!session) return null;
  const { site: subdomain } = await params;
  const query = await searchParams;
  const site = await loadWorkspace(session, subdomain);
  if (!site) notFound();
  const pendingSlugs = new Set(site.pending.map((revision) => revision.slug));
  const importView = !site.hasRepo
    ? await loadImportView({
        userId: session.userId,
        accountId: query.account,
        query: query.q,
        page: Number(query.page ?? "1") || 1,
      })
    : null;

  return (
    <PreviewChat
      siteId={site.id}
      subdomain={site.subdomain}
      host={site.publicHost}
      pendingCount={site.pending.length}
      running={site.jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING")}
      hasRepo={site.hasRepo}
      repoFullName={site.repoFullName}
      activeJob={site.activeJob}
      jobs={site.jobs}
      importView={importView}
      importOpen={query.import === "1"}
      docsRoot={docsRootDomain()}
      installUrl={githubAppInstallUrl()}
      pages={site.pages.map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        pending: pendingSlugs.has(page.slug),
      }))}
      chats={site.chats}
    />
  );
}
