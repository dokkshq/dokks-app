import { appUrl } from "@/lib/config";

const BLOB_HOST = /\.blob\.vercel-storage\.com$/;

export function isBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && BLOB_HOST.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function publicAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isBlobUrl(url)) return url;
  return `/api/media?url=${encodeURIComponent(url)}`;
}

export function absoluteAssetUrl(url: string | null | undefined): string | null {
  const readable = publicAssetUrl(url);
  if (!readable) return null;
  if (readable.startsWith("/")) return `${appUrl()}${readable}`;
  return readable;
}
