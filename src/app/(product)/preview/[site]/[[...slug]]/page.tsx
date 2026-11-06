import { notFound, redirect } from "next/navigation";
import { DocsChrome } from "@/components/docs/docs-chrome";
import { extractHeadings } from "@/components/docs/highlight";
import { DocsMarkdown } from "@/components/docs/markdown";
import { getViewSession } from "@/lib/admin/act-as";
import { publicAssetUrl } from "@/lib/media/public-url";
import { markDraft } from "@/lib/workspace/draft";
import { loadWorkspace } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ site: string; slug?: string[] }>;
}) {
  const session = await getViewSession();
  const { site: subdomain, slug: parts } = await params;
  if (!session) redirect(`/login?next=/preview/${subdomain}`);
  const site = await loadWorkspace(session, subdomain);
  if (!site) notFound();
  const slug = (parts ?? []).join("/");
  const page = site.pages.find((item) => item.slug === slug);
  const draft = site.pending.find((item) => item.slug === slug);
  if (!page && !draft) notFound();
  const title = draft?.title ?? page?.title ?? "";
  const section = draft?.section ?? page?.section ?? null;
  const content = draft?.content ?? page?.content ?? "";
  const marks = draft && page ? markDraft(page.content, draft.content) : null;
  const pendingSlugs = Array.from(new Set(site.pending.map((item) => item.slug)));
  const base = `/preview/${site.subdomain}`;
  const items = site.pages.map((item) => ({
    slug: item.slug,
    title: item.title,
    section: item.section,
    href: item.slug ? `${base}/${item.slug}` : base,
  }));
  for (const revision of site.pending) {
    if (!items.some((item) => item.slug === revision.slug)) {
      items.push({
        slug: revision.slug,
        title: revision.title,
        section: revision.section,
        href: revision.slug ? `${base}/${revision.slug}` : base,
      });
    }
  }
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
      searchItems={items.map((item) => ({ ...item, text: item.title }))}
      currentSlug={slug}
      section={section}
      title={title}
      description={null}
      headings={extractHeadings(content)}
      sources={[]}
      pendingSlugs={pendingSlugs}
    >
      {marks ? (
        <div className="flex flex-col gap-4">
          {marks.map((part) => (
            <div
              key={`${part.heading ?? "intro"}-${part.mark}`}
              className={
                part.mark === "same"
                  ? undefined
                  : "relative rounded-control border border-meter px-3 py-2"
              }
            >
              {part.mark !== "same" ? (
                <span className="absolute top-2 right-2 rounded-control bg-meter px-1.5 py-0.5 text-[10px] tracking-wide text-white uppercase">
                  {part.mark === "new" ? "New section" : "Edited"}
                </span>
              ) : null}
              <DocsMarkdown content={part.markdown} />
            </div>
          ))}
        </div>
      ) : (
        <DocsMarkdown content={content} />
      )}
    </DocsChrome>
  );
}
