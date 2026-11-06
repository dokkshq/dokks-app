import Link from "next/link";
import { GitBranch, Lock, Search } from "lucide-react";
import { ImportAccountMenu } from "../account-menu";
import { ImportRepoDialog } from "../import-repo-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getViewSession } from "@/lib/admin/act-as";
import { productName } from "@/lib/brand";
import { docsRootDomain, githubAppInstallUrl } from "@/lib/config";
import { IMPORT_PAGE_SIZE, loadImportView } from "@/lib/import/queries";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "No pushes yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No pushes yet";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; q?: string; page?: string }>;
}) {
  const session = await getViewSession();
  if (!session) return null;
  const params = await searchParams;
  const page = Number(params.page ?? "1") || 1;
  const view = await loadImportView({
    userId: session.userId,
    accountId: params.account,
    query: params.q,
    page,
  });
  const installUrl = githubAppInstallUrl();
  const docsRoot = docsRootDomain();

  return (
    <>
      <PageHeader
        title="Import repo"
        description="Creates a workspace and starts the first build. Prefer New workspace when you want to name the site first, then attach a repo inside chat."
        action={
          <Button nativeButton={false} variant="outline" render={<Link href="/dashboard/new" />}>
            New workspace
          </Button>
        }
      />

      {!view.connected ? (
        <Alert>
          <AlertTitle>Database is not connected</AlertTitle>
          <AlertDescription>
            Set DATABASE_URL to list GitHub accounts and import repos. Nothing here is sample data.
          </AlertDescription>
        </Alert>
      ) : view.accounts.length === 0 ? (
        <Empty className="border border-border bg-card">
          <EmptyHeader>
            <EmptyTitle>No GitHub accounts connected</EmptyTitle>
            <EmptyDescription>
              Install {productName()} on a personal or organization account, then return here.
            </EmptyDescription>
          </EmptyHeader>
          <Button nativeButton={false} render={<a href={installUrl} />}>
            Install {productName()}
          </Button>
        </Empty>
      ) : (
        <>
          <ImportAccountMenu
            accounts={view.accounts}
            selectedId={view.selectedAccountId}
            installUrl={installUrl}
          />

          <form method="get" className="flex gap-2">
            {view.selectedAccountId ? (
              <input type="hidden" name="account" value={view.selectedAccountId} />
            ) : null}
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <input
                name="q"
                defaultValue={view.query}
                placeholder="Search repositories"
                className="h-9 w-full rounded-control border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-foreground"
              />
            </label>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          {view.repos.length === 0 ? (
            <Empty className="border border-border bg-card">
              <EmptyHeader>
                <EmptyTitle>{view.query ? "No matching repositories" : "No repositories"}</EmptyTitle>
                <EmptyDescription>
                  {view.query
                    ? "Try a different search, or add the repo scope to this GitHub account."
                    : "Add the repo scope to this GitHub account, or push a repo to GitHub."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-control border border-border bg-background">
              <div className="divide-y divide-border">
                {view.repos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                        <p className="truncate text-sm font-medium">{repo.fullName}</p>
                        {repo.private ? (
                          <Badge variant="outline" className="gap-1">
                            <Lock className="size-3" />
                            Private
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Public</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last updated {formatDate(repo.pushedAt)}
                      </p>
                    </div>
                    {repo.imported ? (
                      <span className="text-sm text-muted-foreground">Imported</span>
                    ) : (
                      <ImportRepoDialog
                        repo={repo}
                        docsRoot={docsRoot}
                        isFirstSite={view.isFirstSite}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view.total > 0 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>
                {Math.min((view.page - 1) * IMPORT_PAGE_SIZE + 1, view.total)} to{" "}
                {Math.min(view.page * IMPORT_PAGE_SIZE, view.total)} of {view.total}
              </p>
              <div className="flex gap-2">
                {view.page > 1 ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        href={`/dashboard/import?account=${encodeURIComponent(
                          view.selectedAccountId ?? "",
                        )}&q=${encodeURIComponent(view.query)}&page=${view.page - 1}`}
                      />
                    }
                  >
                    Previous
                  </Button>
                ) : null}
                {view.hasNext ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        href={`/dashboard/import?account=${encodeURIComponent(
                          view.selectedAccountId ?? "",
                        )}&q=${encodeURIComponent(view.query)}&page=${view.page + 1}`}
                      />
                    }
                  >
                    Next
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
