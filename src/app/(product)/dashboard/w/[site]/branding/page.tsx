import { notFound } from "next/navigation";
import { BrandingForm } from "@/components/workspace/branding-form";
import { getViewSession } from "@/lib/admin/act-as";
import { publicAssetUrl } from "@/lib/media/public-url";
import { loadWorkspaceBranding } from "@/lib/workspace/load";

export const dynamic = "force-dynamic";

export default async function BrandingSection({ params }: { params: Promise<{ site: string }> }) {
  const session = await getViewSession();
  if (!session) return null;
  const site = await loadWorkspaceBranding(session, (await params).site);
  if (!site) notFound();
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <BrandingForm
        key={[site.theme, site.appearance, site.primaryColor, site.logoLightUrl, site.logoDarkUrl, site.faviconUrl].join("|")}
        siteId={site.id}
        subdomain={site.subdomain}
        name={site.name}
        host={site.host}
        theme={site.theme}
        appearance={site.appearance}
        primaryColor={site.primaryColor}
        logoLightUrl={publicAssetUrl(site.logoLightUrl)}
        logoDarkUrl={publicAssetUrl(site.logoDarkUrl)}
        faviconUrl={publicAssetUrl(site.faviconUrl)}
        pages={site.pages.map((page) => ({
          slug: page.slug,
          title: page.title,
          section: page.section,
        }))}
      />
    </div>
  );
}
