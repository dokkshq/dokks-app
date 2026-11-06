"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLockup } from "@/components/brand/logo";
import { UserMenu, type MenuUser } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "cn";

export type ShellItem = { href: string; label: string };

export function AppShell({
  items,
  user,
  actAs,
  devPreview,
  announcement,
  children,
}: {
  items: ShellItem[];
  user: MenuUser;
  actAs?: { login: string; name: string | null } | null;
  devPreview: boolean;
  announcement?: { title: string; body: string } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {actAs ? (
        <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
          <span>
            Viewing as {actAs.name || actAs.login}. Read-only. No writes are possible.
          </span>
          <form action="/api/admin/act-as/stop" method="post">
            <SubmitButton
              size="xs"
              className="bg-background text-primary hover:bg-background/90"
              loadingText="Stopping..."
            >
              Stop viewing
            </SubmitButton>
          </form>
        </div>
      ) : null}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center px-5">
          <BrandLockup />
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {items.map((item) => (
            <ShellLink key={item.href} item={item} />
          ))}
        </nav>
      </aside>
      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" size="icon" className="md:hidden" />
                }
              >
                <Menu />
                <span className="sr-only">Open menu</span>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>
                    <BrandLockup />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4">
                  {items.map((item) => (
                    <ShellLink key={item.href} item={item} />
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
            <span className="md:hidden">
              <BrandLockup />
            </span>
          </div>
          <div className="flex items-center gap-3">
            {actAs ? (
              <span className="text-sm text-muted-foreground">
                {actAs.name || actAs.login}
              </span>
            ) : devPreview ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                Dev preview
              </span>
            ) : (
              <UserMenu user={user} />
            )}
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
          {announcement ? (
            <div className="rounded-control border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm font-medium">{announcement.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {announcement.body}
              </p>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function ShellLink({ item }: { item: ShellItem }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      className={cn(
        "rounded-control px-3 py-2 text-sm",
        active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
      )}
    >
      {item.label}
    </Link>
  );
}
