import { describe, expect, it } from "vitest";
import { MAX_BRAND_IMAGE_BYTES, validateBrandImage } from "@/lib/sites/brand-image";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 0]);

describe("brand image validation", () => {
  it("accepts PNG, JPEG, and WebP logos", () => {
    expect(validateBrandImage({ type: "image/png", size: png.length, bytes: png })).toMatchObject({
      ok: true,
      extension: "png",
    });
    expect(validateBrandImage({ type: "image/jpeg", size: jpeg.length, bytes: jpeg })).toMatchObject({
      ok: true,
      extension: "jpg",
    });
    expect(validateBrandImage({ type: "image/webp", size: webp.length, bytes: webp })).toMatchObject({
      ok: true,
      extension: "webp",
    });
  });

  it("accepts an ICO favicon and a PNG sent as an icon", () => {
    expect(
      validateBrandImage({ type: "image/x-icon", size: ico.length, bytes: ico, favicon: true }),
    ).toMatchObject({ ok: true, extension: "ico", contentType: "image/x-icon" });
    expect(
      validateBrandImage({ type: "image/vnd.microsoft.icon", size: png.length, bytes: png, favicon: true }),
    ).toMatchObject({ ok: true, extension: "png" });
  });

  it("accepts a PNG whose browser omitted the file type", () => {
    expect(validateBrandImage({ type: "", size: png.length, bytes: png })).toMatchObject({
      ok: true,
      extension: "png",
    });
  });

  it("rejects an ICO used as a logo", () => {
    expect(validateBrandImage({ type: "image/x-icon", size: ico.length, bytes: ico })).toEqual({
      ok: false,
      reason: "type",
    });
  });

  it("rejects a mismatched type, an empty file, and an oversized file", () => {
    expect(validateBrandImage({ type: "image/png", size: png.length, bytes: jpeg })).toEqual({
      ok: false,
      reason: "type",
    });
    expect(validateBrandImage({ type: "image/png", size: 0, bytes: png })).toEqual({
      ok: false,
      reason: "size",
    });
    expect(
      validateBrandImage({ type: "image/png", size: MAX_BRAND_IMAGE_BYTES + 1, bytes: png }),
    ).toEqual({ ok: false, reason: "size" });
  });
});
