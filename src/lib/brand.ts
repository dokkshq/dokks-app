const HEX = /^#[0-9A-Fa-f]{6}$/;

export const PAGE_BACKGROUND = "#FAFAFA";
export const HAIRLINE = "#EBEBEB";
export const INK = "#171717";
export const MUTED = "#6B6B6B";

export const MARK_BLACK = "/dokks_brand_kit/logo/transparent/dokks_logo_black_transparent.png";
export const MARK_WHITE = "/dokks_brand_kit/logo/transparent/dokks_logo_white_transparent.png";
export const MARK_BLUE = "/dokks_brand_kit/logo/transparent/dokks_logo_blue_transparent.png";
export const MARK_EMAIL = "/dokks_brand_kit/logo/static/dokks_logo_blue_on_white.png";
export const LOCKUP_BLACK =
  "/dokks_brand_kit/lockup/landscape/transparent/dokks_lockup_landscape_black_transparent.png";
export const LOCKUP_WHITE =
  "/dokks_brand_kit/lockup/landscape/transparent/dokks_lockup_landscape_white_transparent.png";
export const MARK_WHITE_ON_BLACK =
  "/dokks_brand_kit/logo/static/dokks_logo_white_on_black.png";

export function productName(): string {
  const value = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_PRODUCT_NAME is required");
  return value;
}

export function marketingUrl(): string {
  const value = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_MARKETING_URL is required");
  return value.replace(/\/$/, "");
}

export function brandPrimary(): string {
  const raw = process.env.NEXT_PUBLIC_BRAND_PRIMARY;
  const value = stripWrappingQuotes(raw).trim();
  if (!value || !HEX.test(value)) {
    throw new Error("NEXT_PUBLIC_BRAND_PRIMARY must be a #RRGGBB color");
  }
  return value;
}

function stripWrappingQuotes(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (trimmed.length >= 2 && ((first === '"' && last === '"') || (first === "'" && last === "'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function sanitizeColor(value: string | null | undefined): string {
  if (value && HEX.test(value)) return value;
  return brandPrimary();
}
