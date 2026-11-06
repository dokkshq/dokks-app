export const MAX_BRAND_IMAGE_BYTES = 2 * 1024 * 1024;

export type BrandImageValidation =
  | {
      ok: true;
      contentType: "image/png" | "image/jpeg" | "image/webp" | "image/x-icon";
      extension: "png" | "jpg" | "webp" | "ico";
    }
  | { ok: false; reason: "size" | "type" };

const ICON_TYPES = new Set([
  "",
  "application/octet-stream",
  "image/ico",
  "image/icon",
  "image/vnd.microsoft.icon",
  "image/x-icon",
]);

function declaredType(type: string): string {
  return type.toLowerCase().split(";")[0]?.trim() ?? "";
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function validateBrandImage(input: {
  type: string;
  size: number;
  bytes: Uint8Array;
  favicon?: boolean;
}): BrandImageValidation {
  if (input.size <= 0 || input.size > MAX_BRAND_IMAGE_BYTES) {
    return { ok: false, reason: "size" };
  }
  const type = declaredType(input.type);
  const iconType = Boolean(input.favicon) && ICON_TYPES.has(type);
  const untyped = type === "" || type === "application/octet-stream";
  if (hasPrefix(input.bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && (type === "image/png" || untyped || iconType)) {
    return { ok: true, contentType: "image/png", extension: "png" };
  }
  if (hasPrefix(input.bytes, [0xff, 0xd8, 0xff]) && (type === "image/jpeg" || type === "image/jpg" || untyped || iconType)) {
    return { ok: true, contentType: "image/jpeg", extension: "jpg" };
  }
  if (isWebp(input.bytes) && (type === "image/webp" || untyped || iconType)) {
    return { ok: true, contentType: "image/webp", extension: "webp" };
  }
  if (input.favicon && hasPrefix(input.bytes, [0x00, 0x00, 0x01, 0x00]) && (iconType || type === "image/png")) {
    return { ok: true, contentType: "image/x-icon", extension: "ico" };
  }
  return { ok: false, reason: "type" };
}
