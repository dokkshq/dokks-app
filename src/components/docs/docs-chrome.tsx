"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Menu } from "lucide-react";
import { BuiltWith } from "@/components/docs/built-with";
import { DocsSearch, type DocsSearchItem } from "@/components/docs/search";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "cn";

export type DocsNavItem = {
  href: string;
  title: string;
  section: string | null;
  slug: string;
};

export type DocsHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type DocsSourceLink = {
  path: string;
  href: string | null;
};

export function DocsChrome({
  name,
  theme,
  appearance,
  primaryColor,
  logoLightUrl,
  logoDarkUrl,
  logoHref,
  items,
  searchItems,
  currentSlug,
  section,
  title,
  description,
  headings,
  sources,
  pendingSlugs,
  children,
}: {
  name: string;
  theme: "LEDGER" | "MINIMAL";
  appearance: "SYSTEM" | "LIGHT" | "DARK";
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  logoHref: string | null;
  items: DocsNavItem[];
  searchItems: DocsSearchItem[];
  currentSlug: string;
  section: string | null;
  title: string;
  description: string | null;
  headings: DocsHeading[];
  sources: DocsSourceLink[];
  pendingSlugs?: string[];
  children: React.ReactNode;
}) {
  const systemDark = useSyncExternalStore(
    subscribeToColorScheme,
    prefersDark,
    () => false,
  );
  const dark = appearance === "DARK" || (appearance === "SYSTEM" && systemDark);

  const logo = dark ? logoDarkUrl || logoLightUrl : logoLightUrl || logoDarkUrl;
  const sections = groupSections(items);
  const index = items.findIndex((item) => item.slug === currentSlug);
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  return (
    <div
      className={cn("min-h-screen bg-background text-foreground", dark ? "dark" : "docs-light")}
      style={{ "--docs-primary": primaryColor } as React.CSSProperties}
    >
      <div className="min-h-screen bg-background text-foreground">
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-white md:flex dark:bg-card">
          <Brand name={name} logo={logo} logoHref={logoHref} />
          <div className="px-3 pb-2">
            <DocsSearch items={searchItems} />
          </div>
          <DocsNav sections={sections} currentSlug={currentSlug} pendingSlugs={pendingSlugs} />
        </aside>
        <div className="md:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-white px-4 md:hidden dark:bg-card">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="icon" />}>
                <Menu />
                <span className="sr-only">Open sections</span>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>{name}</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-3">
                  <DocsSearch items={searchItems} />
                </div>
                <DocsNav sections={sections} currentSlug={currentSlug} pendingSlugs={pendingSlugs} />
              </SheetContent>
            </Sheet>
            {logo ? (
              // Customer logos are arbitrary https URLs, so this stays a plain image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${name} logo`} className="h-7 w-auto max-w-[10rem] object-contain" />
            ) : (
              <span className="truncate text-sm">{name}</span>
            )}
          </header>
          <div className="mx-auto flex w-full max-w-6xl items-start">
          <article
            className={cn(
              "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 pb-16 md:px-10 md:py-12 md:pb-24",
              theme === "LEDGER" && "md:border-l md:border-border",
            )}
          >
            {theme === "LEDGER" && section ? (
              <p className="font-mono text-xs tracking-widest text-(--docs-primary) uppercase">
                {section}
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl tracking-tight md:text-4xl">{title}</h1>
              {description ? (
                <p className="text-base leading-7 text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {headings.length > 0 ? (
              <nav className="rounded-control border border-border p-3 xl:hidden">
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                  On this page
                </p>
                <HeadingLinks headings={headings} />
              </nav>
            ) : null}
            {children}
            {sources.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                  View source
                </p>
                <ul className="flex flex-col gap-1">
                  {sources.map((source) => (
                    <li key={source.path} className="font-mono text-xs">
                      {source.href ? (
                        <a href={source.href} className="text-(--docs-primary) underline underline-offset-4">
                          {source.path}
                        </a>
                      ) : (
                        source.path
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {previous || next ? (
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                {previous ? (
                  <Link href={previous.href} className="rounded-control border border-border px-4 py-3 text-sm">
                    <span className="block text-xs text-muted-foreground">Previous</span>
                    {previous.title}
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link href={next.href} className="rounded-control border border-border px-4 py-3 text-right text-sm">
                    <span className="block text-xs text-muted-foreground">Next</span>
                    {next.title}
                  </Link>
                ) : null}
              </div>
            ) : null}
            <BuiltWith placement="inline" />
          </article>
          {headings.length > 0 ? (
            <aside className="sticky top-8 hidden w-52 shrink-0 self-start pr-6 xl:block">
              <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
                On this page
              </p>
              <HeadingLinks headings={headings} />
            </aside>
          ) : null}
          </div>
        </div>
        <BuiltWith />
      </div>
    </div>
  );
}

function Brand({
  name,
  logo,
  logoHref,
}: {
  name: string;
  logo: string | null;
  logoHref: string | null;
}) {
  const mark = logo ? (
    // Customer logos are arbitrary https URLs, so this stays a plain image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt={`${name} logo`} className="h-7 w-auto max-w-[11rem] object-contain" />
  ) : (
    <span className="text-sm">{name}</span>
  );
  return (
    <div className="flex h-14 items-center px-5">
      {logoHref ? <a href={logoHref}>{mark}</a> : mark}
    </div>
  );
}

function DocsNav({
  sections,
  currentSlug,
  pendingSlugs = [],
}: {
  sections: Array<{ section: string; items: DocsNavItem[] }>;
  currentSlug: string;
  pendingSlugs?: string[];
}) {
  return (
    <nav className="flex flex-col gap-5 overflow-y-auto px-3 py-4">
      {sections.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className="px-3 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            {group.section}
          </p>
          {group.items.map((item) => (
            <Link
              key={item.slug || "home"}
              href={item.href}
              className={cn(
                "rounded-control px-3 py-1.5 text-sm",
                item.slug === currentSlug
                  ? "bg-accent text-(--docs-primary)"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                {item.title}
                {pendingSlugs.includes(item.slug) ? (
                  <span className="size-1.5 rounded-full bg-live" />
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function HeadingLinks({ headings }: { headings: DocsHeading[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {headings.map((heading) => (
        <li key={heading.id} className={heading.level === 3 ? "pl-3" : undefined}>
          <a href={`#${heading.id}`} className="text-sm text-muted-foreground hover:text-foreground">
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

function subscribeToColorScheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function groupSections(items: DocsNavItem[]) {
  const groups: Array<{ section: string; items: DocsNavItem[] }> = [];
  for (const item of items) {
    const section = item.section || "Docs";
    const last = groups[groups.length - 1];
    if (!last || last.section !== section) {
      groups.push({ section, items: [item] });
    } else {
      last.items.push(item);
    }
  }
  return groups;
}
