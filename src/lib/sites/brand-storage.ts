import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { ProfileStorageUnconfigured } from "@/lib/profile/storage";
import { validateBrandImage } from "@/lib/sites/brand-image";

export class BrandImageError extends Error {
  constructor(readonly reason: "size" | "type") {
    super(reason);
  }
}

export async function uploadSiteBrandImage(args: {
  siteId: string;
  slot: "logo-light" | "logo-dark" | "favicon";
  file: Blob;
}): Promise<{ url: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new ProfileStorageUnconfigured();
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const validation = validateBrandImage({
    type: args.file.type,
    size: bytes.byteLength,
    bytes,
    favicon: args.slot === "favicon",
  });
  console.info("[branding] checked", {
    slot: args.slot,
    type: args.file.type,
    size: bytes.byteLength,
    signature: [...bytes.subarray(0, 8)].map((value) => value.toString(16).padStart(2, "0")).join(" "),
    ok: validation.ok,
    reason: validation.ok ? undefined : validation.reason,
  });
  if (!validation.ok) throw new BrandImageError(validation.reason);
  const blob = await put(
    `sites/${args.siteId}/${args.slot}-${randomUUID()}.${validation.extension}`,
    Buffer.from(bytes),
    {
      access: "private",
      contentType: validation.contentType,
      token,
      addRandomSuffix: false,
    },
  );
  return { url: blob.url };
}

export async function deleteSiteBrandImage(url: string | null | undefined): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!url || !token || !url.includes(".blob.vercel-storage.com")) return;
  try {
    await del(url, { token });
  } catch {
    // A stale blob is better than blocking the branding save.
  }
}
