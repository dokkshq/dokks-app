import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { validateProfileImage } from "@/lib/profile/image";

export class ProfileStorageUnconfigured extends Error {
  constructor() {
    super("BLOB_READ_WRITE_TOKEN is not configured");
  }
}

export async function uploadProfileImage(args: {
  userId: string;
  file: File;
}): Promise<{ url: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new ProfileStorageUnconfigured();
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const validation = validateProfileImage({
    type: args.file.type,
    size: args.file.size,
    bytes,
  });
  if (!validation.ok) throw new Error(validation.reason);
  const blob = await put(
    `profiles/${args.userId}-${randomUUID()}.${validation.extension}`,
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

export async function deleteProfileImage(url: string | null | undefined): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!url || !token) return;
  try {
    await del(url, { token });
  } catch {
    // A stale blob is better than blocking the profile update.
  }
}
