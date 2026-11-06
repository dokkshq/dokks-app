"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLockup } from "@/components/brand/logo";
import { marketingUrl } from "@/lib/brand";
import { UserMenu, type MenuUser } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "cn";

export function ProductFrame({
  user,
  actAs,
  banner,
  children,
}: {
  user: MenuUser;
  actAs?: { login: string; name: string | null } | null;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const links = [
    { href: "/dashboard", label: "Workspaces" },
    { href: "/dashboard/usage", label: "Usage" },
    { href: marketingUrl(), label: "Docs", external: true },
    { href: "/dashboard/feedback", label: "Feedback" },
  ];
  return (
    <div className="min-h-screen bg-background">
      {actAs ? (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
          <span>{actAs.name || actAs.login}</span>
          <form action="/api/admin/act-as/stop" method="post">
            <SubmitButton size="xs" className="bg-background text-primary hover:bg-background/90">
              Stop
            </SubmitButton>
          </form>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon" className="md:hidden" />}>
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
                {links.map((link) => (
                  <NavLink key={link.href} {...link} />
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <BrandLockup />
        </div>
        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 md:flex">
            {links.map((link) => (
              <NavLink key={link.href} {...link} />
            ))}
          </nav>
          {actAs ? null : <UserMenu user={user} />}
        </div>
      </header>
      {banner}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const pathname = usePathname();
  const active = !external && (href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        "text-sm",
        active ? "text-foreground underline decoration-meter decoration-2 underline-offset-8" : "text-muted-foreground",
      )}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {label}
    </Link>
  );
}
