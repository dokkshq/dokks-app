import { notFound } from "next/navigation";
import { DocsChrome, type DocsNavItem, type DocsSourceLink } from "@/components/docs/docs-chrome";
import { extractHeadings, readSourceComment, sourceUrl } from "@/components/docs/highlight";
import { DocsMarkdown } from "@/components/docs/markdown";
import { publicAssetUrl } from "@/lib/media/public-url";
import { findPage } from "@/lib/sites/load";
import type { DocsSite } from "@/lib/sites/types";

export function DocsRoute({
  site,
  slug,
  basePath,
}: {
  site: DocsSite | null;
  slug: string;
  basePath: string;
}) {
  if (!site) notFound();
  const paused = site.status === "PAUSED";
  const page = paused ? null : findPage(site, slug);
  if (!paused && !page) notFound();

  const items: DocsNavItem[] = site.pages
    .filter((item) => item.published)
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      section: item.section,
      href: item.slug ? `${basePath}/${item.slug}` : basePath || "/",
    }));
  const content = page?.content ?? "";
  const sources: DocsSourceLink[] = paused
    ? []
    : readSourceComment(content).map((path) => ({
        path,
        href:
          site.repoFullName && site.repoBranch
            ? sourceUrl(site.repoFullName, site.repoBranch, path)
            : null,
      }));

  return (
    <DocsChrome
      name={site.name}
      theme={site.theme}
      appearance={site.appearance}
      primaryColor={site.primaryColor}
      logoLightUrl={publicAssetUrl(site.logoLightUrl)}
      logoDarkUrl={publicAssetUrl(site.logoDarkUrl)}
      logoHref={site.logoHref}
      items={items}
      searchItems={items.map((item) => {
        const match = site.pages.find((pageItem) => pageItem.slug === item.slug);
        return {
          ...item,
          text: (match?.content ?? "").replace(/[#>*_`-]/g, " ").slice(0, 500),
        };
      })}
      currentSlug={slug}
      section={paused ? null : (page?.section ?? null)}
      title={paused ? "This docs site is paused" : (page?.title ?? "")}
      headings={paused ? [] : extractHeadings(content)}
      sources={sources}
      description={
        paused
          ? "The GitHub App was removed or the repo is no longer connected. The pages stay here until the site is connected again."
          : (page?.description ?? null)
      }
    >
      {paused ? null : <DocsMarkdown content={content} />}
    </DocsChrome>
  );
}
