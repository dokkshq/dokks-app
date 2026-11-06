import { publicAssetUrl } from "@/lib/media/public-url";

export function initialsFor(name: string | null, login: string): string {
  const source = (name ?? "").trim() || login.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function avatarFor(user: {
  imageUrl?: string | null;
  avatarUrl?: string | null;
}): string | null {
  return publicAssetUrl(user.imageUrl) || user.avatarUrl || null;
}
