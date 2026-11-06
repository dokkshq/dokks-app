"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, GitBranch, Lock, Plus, Search } from "lucide-react";
import { attachRepositoryAction } from "@/app/(product)/dashboard/actions";
import { productName } from "@/lib/brand";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SubmitButton } from "@/components/ui/submit-button";
import { IMPORT_PAGE_SIZE, type ImportView } from "@/lib/import/types";
import { initialsFor } from "@/lib/profile/avatar";

export function WorkspaceImportDialog({
  siteId,
  subdomain,
  docsRoot,
  installUrl,
  view,
  defaultOpen = false,
}: {
  siteId: string;
  subdomain: string;
  docsRoot: string;
  installUrl: string;
  view: ImportView;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState(view.query);
  const base = `/dashboard/w/${subdomain}`;
  const selected = view.accounts.find((account) => account.id === view.selectedAccountId) ?? null;

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    setQuery(view.query);
  }, [view.query]);

  const hrefFor = (overrides: { account?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams();
    params.set("import", "1");
    const account = overrides.account ?? view.selectedAccountId ?? "";
    if (account) params.set("account", account);
    const q = overrides.q ?? view.query;
    if (q) params.set("q", q);
    const page = overrides.page ?? view.page;
    if (page > 1) params.set("page", String(page));
    return `${base}?${params.toString()}`;
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || needle === view.query.trim().toLowerCase()) return view.repos;
    return view.repos.filter((repo) => repo.fullName.toLowerCase().includes(needle));
  }, [query, view.query, view.repos]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Import repository</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a repository</DialogTitle>
          <DialogDescription>
            Attach a GitHub repo to this workspace. The first build starts immediately and shows in
            chat. Docs will publish at {subdomain}.{docsRoot}.
          </DialogDescription>
        </DialogHeader>

        {!view.connected ? (
          <p className="text-sm text-muted-foreground">
            Set DATABASE_URL to list GitHub accounts and import repos.
          </p>
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
          <div className="flex flex-col gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-control border border-border bg-background px-3 py-2.5 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {selected ? (
                        <Avatar size="sm">
                          {selected.avatarUrl ? <AvatarImage src={selected.avatarUrl} alt="" /> : null}
                          <AvatarFallback>{initialsFor(selected.login, selected.login)}</AvatarFallback>
                        </Avatar>
                      ) : null}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {selected ? selected.login : "Choose an account"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {selected
                            ? `${selected.type === "Organization" ? "Organization" : "Personal"} · ${selected.repoCount} ${
                                selected.repoCount === 1 ? "repo" : "repos"
                              }`
                            : "Connect GitHub to list repositories"}
                        </span>
                      </span>
                    </span>
                    <ChevronDown className="size-4 shrink-0" />
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>GitHub accounts</DropdownMenuLabel>
                  {view.accounts.map((account) => (
                    <DropdownMenuItem
                      key={account.id}
                      render={
                        <Link
                          href={hrefFor({ account: account.id, page: 1 })}
                          className="flex items-center gap-3"
                        />
                      }
                    >
                      <Avatar size="sm">
                        {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
                        <AvatarFallback>{initialsFor(account.login, account.login)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{account.login}</span>
                        <span className="block text-xs text-muted-foreground">
                          {account.type === "Organization" ? "Organization" : "Personal"}
                        </span>
                      </span>
                      {account.id === view.selectedAccountId ? (
                        <span className="text-xs text-muted-foreground">Selected</span>
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<a href={installUrl} className="flex items-center gap-2" />}>
                  <Plus className="size-4" />
                  Add GitHub Scope
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setOpen(true);
                router.push(hrefFor({ q: query, page: 1 }));
              }}
            >
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search repositories"
                  className="h-9 w-full rounded-control border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-foreground"
                />
              </label>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>

            {filtered.length === 0 ? (
              <Empty className="border border-border bg-card">
                <EmptyHeader>
                  <EmptyTitle>{query ? "No matching repositories" : "No repositories"}</EmptyTitle>
                  <EmptyDescription>
                    {query
                      ? "Try a different search, or add the repo scope to this GitHub account."
                      : "Add the repo scope to this GitHub account, or push a repo to GitHub."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="max-h-72 overflow-auto rounded-control border border-border">
                <div className="divide-y divide-border">
                  {filtered.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
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
                      </div>
                      {repo.imported ? (
                        <span className="text-sm text-muted-foreground">Imported elsewhere</span>
                      ) : (
                        <form action={attachRepositoryAction}>
                          <input type="hidden" name="siteId" value={siteId} />
                          <input type="hidden" name="subdomain" value={subdomain} />
                          <input type="hidden" name="repoId" value={repo.id} />
                          <SubmitButton size="sm" loadingText="Starting...">
                            Import
                          </SubmitButton>
                        </form>
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
                      render={<Link href={hrefFor({ page: view.page - 1 })} />}
                      onClick={() => setOpen(true)}
                    >
                      Previous
                    </Button>
                  ) : null}
                  {view.hasNext ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link href={hrefFor({ page: view.page + 1 })} />}
                      onClick={() => setOpen(true)}
                    >
                      Next
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
