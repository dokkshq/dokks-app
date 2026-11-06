import type { Metadata } from "next";
import { headers } from "next/headers";
import { appHosts, docsRootDomain, ogSecret } from "@/lib/config";
import { buildOgImagePath, parseOgParams } from "@/lib/og/sign";
import { resolveHost } from "@/lib/sites/host";
import { absoluteAssetUrl } from "@/lib/media/public-url";
import { canonicalOrigin, findPage, pagePath } from "@/lib/sites/load";
import type { DocsPage, DocsSite } from "@/lib/sites/types";

export async function requestDocsContext(): Promise<{
  origin: string;
  publicHost: string | null;
}> {
  const headerList = await headers();
  const publicHost = headerList.get("x-opentip-public-host");
  const host = publicHost || headerList.get("host") || "localhost:3000";
  const proto =
    host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return { origin: `${proto}://${host}`, publicHost };
}

export function docsBasePath(input: {
  publicHost: string | null;
  subdomain?: string;
  domain?: string;
}): string {
  const resolved = resolveHost(input.publicHost ?? "", {
    appHosts: appHosts(),
    docsRootDomain: docsRootDomain(),
  });
  if (resolved.kind === "docs" || resolved.kind === "custom") return "";
  if (input.domain) return `/sites/domain/${input.domain}`;
  return `/sites/${input.subdomain ?? ""}`;
}

export function docsPageMetadata(
  site: DocsSite,
  slug: string,
  imageOrigin: string,
): Metadata {
  const page = findPage(site, slug);
  const paused = site.status === "PAUSED";
  const title = paused ? "This site is paused" : (page?.title ?? "Not found");
  const description = paused
    ? `${site.name} is paused.`
    : (page?.description ?? site.description ?? "");
  const canonical = `${canonicalOrigin(site)}${pagePath(page ? slug : "")}`;
  const noindex = paused || !page;
  const image = page ? socialImage(site, page, imageOrigin) : undefined;
  return {
    title: { absolute: `${title} · ${site.name}` },
    description,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    icons: site.faviconUrl
      ? {
          icon: [{ url: absoluteAssetUrl(site.faviconUrl) ?? site.faviconUrl }],
          apple: [{ url: absoluteAssetUrl(site.faviconUrl) ?? site.faviconUrl }],
        }
      : { icon: [] },
    openGraph: {
      title,
      description,
      url: canonical,
      images: image ? [{ url: image, width: 1200, height: 630 }] : undefined,
    },
  };
}

function socialImage(site: DocsSite, page: DocsPage, origin: string): string | undefined {
  if (page.ogImageUrl) return page.ogImageUrl;
  if (site.ogImageUrl) return site.ogImageUrl;
  const secret = ogSecret();
  if (!secret) return undefined;
  const parsed = parseOgParams({
    siteName: site.name,
    section: page.section ?? "",
    title: page.title,
    description: page.description ?? "",
    primary: site.primaryColor,
    logo: absoluteAssetUrl(site.logoLightUrl) ?? "",
    background: site.ogBackgroundUrl ?? "",
  });
  if (!parsed.ok) return undefined;
  return `${origin}${buildOgImagePath(parsed.params, secret)}`;
}
