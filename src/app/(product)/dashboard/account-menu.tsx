"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ImportAccount } from "@/lib/import/types";
import { initialsFor } from "@/lib/profile/avatar";

function accountHref(basePath: string, accountId: string): string {
  const url = new URL(basePath, "https://opentip.local");
  if (basePath.startsWith("/dashboard/w/")) {
    url.searchParams.set("import", "1");
  }
  url.searchParams.set("account", accountId);
  return `${url.pathname}${url.search}`;
}

export function ImportAccountMenu({
  accounts,
  selectedId,
  installUrl,
  basePath = "/dashboard/import",
}: {
  accounts: ImportAccount[];
  selectedId: string | null;
  installUrl: string;
  basePath?: string;
}) {
  const selected = accounts.find((account) => account.id === selectedId) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-control border border-border bg-background px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              {selected ? (
                <Avatar>
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
          {accounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              render={
                <Link
                  href={accountHref(basePath, account.id)}
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
              {account.id === selectedId ? (
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
  );
}
