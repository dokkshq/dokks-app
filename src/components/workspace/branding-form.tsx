"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus } from "lucide-react";
import { saveWorkspaceAction } from "@/app/(product)/dashboard/w/[site]/actions";
import { BuiltWith } from "@/components/docs/built-with";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "cn";

export type BrandingPreviewPage = {
  slug: string;
  title: string;
  section: string | null;
};

const THEMES = [
  { value: "MINIMAL", label: "Minimal", detail: "Title and text only" },
  { value: "LEDGER", label: "Ledger", detail: "Section label and a side rule" },
] as const;

const APPEARANCES = [
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
  { value: "SYSTEM", label: "System" },
] as const;

export function BrandingForm({
  siteId,
  subdomain,
  name,
  host,
  theme,
  appearance,
  primaryColor,
  logoLightUrl,
  logoDarkUrl,
  faviconUrl,
  pages,
}: {
  siteId: string;
  subdomain: string;
  name: string;
  host: string;
  theme: "LEDGER" | "MINIMAL";
  appearance: "SYSTEM" | "LIGHT" | "DARK";
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  pages: BrandingPreviewPage[];
}) {
  const [themeValue, setThemeValue] = useState(theme);
  const [appearanceValue, setAppearanceValue] = useState(appearance);
  const [color, setColor] = useState(normalizeColor(primaryColor));
  const light = useAsset(logoLightUrl);
  const darkLogo = useAsset(logoDarkUrl);
  const favicon = useAsset(faviconUrl);
  const systemDark = useSyncExternalStore(subscribeToColorScheme, prefersDark, () => false);
  const dark = appearanceValue === "DARK" || (appearanceValue === "SYSTEM" && systemDark);
  const logo = dark ? darkLogo.url || light.url : light.url || darkLogo.url;
  const previewPages = pages.length > 0 ? pages.slice(0, 8) : [{ slug: "", title: "Overview", section: "Docs" }];
  const current = previewPages[0];
  const swatches = uniqueColors([color, "#171717", "#0F766E", "#1D4ED8", "#B45309", "#BE123C"]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    for (const key of ["logoLight", "logoDark", "favicon"]) {
      const value = data.get(key);
      if (value instanceof File) {
        console.info(`[branding] browser ${key}`, { name: value.name, type: value.type, size: value.size });
      } else {
        console.info(`[branding] browser ${key}`, { received: value === null ? "missing" : typeof value });
      }
    }
  }

  return (
    <form action={saveWorkspaceAction} onSubmit={onSubmit} className="flex h-full min-h-0 flex-col lg:flex-row">
      <input type="hidden" name="kind" value="branding" />
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="subdomain" value={subdomain} />
      <input type="hidden" name="section" value="/branding" />
      <input type="hidden" name="theme" value={themeValue} />
      <input type="hidden" name="appearance" value={appearanceValue} />
      <input type="hidden" name="primaryColor" value={color} />

      <div className="flex w-full shrink-0 flex-col gap-5 overflow-auto border-border p-4 lg:min-h-0 lg:w-[300px] lg:border-r">
        <div>
          <h1 className="text-lg">Branding</h1>
          <p className="mt-1 text-xs text-muted-foreground">Uploads and color update the preview before you save.</p>
        </div>

        <AssetField
          label="Logo, light background"
          name="logoLight"
          accept="image/png,image/jpeg,image/webp"
          hint="PNG, JPEG, or WebP. Max 2 MB."
          asset={light}
          frameClassName="bg-white"
        />
        <AssetField
          label="Logo, dark background"
          name="logoDark"
          accept="image/png,image/jpeg,image/webp"
          hint="Shown when the docs are dark."
          asset={darkLogo}
          frameClassName="bg-neutral-950"
        />
        <AssetField
          label="Favicon"
          name="favicon"
          accept="image/png,image/jpeg,image/webp,image/x-icon,.ico"
          hint="PNG, JPEG, WebP, or ICO. Max 2 MB."
          asset={favicon}
          frameClassName="bg-muted"
          square
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">Primary color</legend>
          <div className="flex items-center gap-2">
            <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-control border border-border">
              <span className="sr-only">Choose a primary color</span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.currentTarget.value)}
                className="absolute -inset-1/4 size-[150%] cursor-pointer border-0 p-0"
              />
            </label>
            <span className="font-mono text-xs text-muted-foreground">{color}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={swatch.toLowerCase() === color.toLowerCase()}
                onClick={() => setColor(swatch.toLowerCase())}
                className={cn(
                  "size-7 rounded-control border border-border",
                  swatch.toLowerCase() === color.toLowerCase() && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </fieldset>

        <ChoiceGroup
          legend="Theme"
          value={themeValue}
          options={THEMES}
          onChange={(value) => {
            if (value === "LEDGER" || value === "MINIMAL") setThemeValue(value);
          }}
        />
        <ChoiceGroup
          legend="Appearance"
          value={appearanceValue}
          options={APPEARANCES}
          onChange={(value) => {
            if (value === "SYSTEM" || value === "LIGHT" || value === "DARK") setAppearanceValue(value);
          }}
        />

        <div className="sticky bottom-0 bg-background pt-2">
          <SubmitButton className="w-full">Save branding</SubmitButton>
        </div>
      </div>

      <div className="order-first flex min-h-[70vh] min-w-0 flex-1 flex-col lg:order-none lg:min-h-0">
        <div
          role="img"
          aria-label="Docs preview"
          className="pointer-events-none flex min-h-0 flex-1 flex-col border-b border-border bg-muted/40 lg:border-b-0"
        >
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
              <span className="size-2.5 rounded-full bg-border" />
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
              {favicon.url ? (
                // Brand files are blob or object URLs, so this stays a plain image.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={favicon.url} alt="" className="size-4 shrink-0 object-contain" />
              ) : (
                <span className="size-4 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
              )}
              <span className="truncate">{host}</span>
            </div>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-auto", dark ? "dark" : "docs-light")} style={{ "--docs-primary": color } as React.CSSProperties}>
            <div className="flex min-h-full bg-background text-foreground">
              <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-white sm:flex dark:bg-card">
                <div className="flex h-14 items-center px-5">
                  <BrandMark name={name} logo={logo} />
                </div>
                <nav className="flex flex-col gap-4 px-3 py-2">
                  {groupPages(previewPages).map((group) => (
                    <div key={group.section} className="flex flex-col gap-1">
                      <p className="px-3 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">{group.section}</p>
                      {group.items.map((item) => (
                        <span
                          key={item.slug || item.title}
                          className={cn(
                            "rounded-control px-3 py-1.5 text-sm",
                            item.slug === current.slug ? "bg-accent text-(--docs-primary)" : "text-foreground",
                          )}
                        >
                          {item.title}
                        </span>
                      ))}
                    </div>
                  ))}
                </nav>
              </aside>
              <div className="min-w-0 flex-1">
                <div className="flex h-14 items-center border-b border-border px-5 sm:hidden">
                  <BrandMark name={name} logo={logo} />
                </div>
                <article
                  className={cn(
                    "mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8 md:px-10 md:py-12",
                    themeValue === "LEDGER" && "md:border-l md:border-border",
                  )}
                >
                  {themeValue === "LEDGER" && current.section ? (
                    <p className="font-mono text-xs tracking-widest text-(--docs-primary) uppercase">{current.section}</p>
                  ) : null}
                  <h2 className="text-3xl tracking-tight">{current.title}</h2>
                  <p className="text-base leading-7 text-muted-foreground">
                    This is how your docs chrome uses the logo, favicon, and{" "}
                    <span className="text-(--docs-primary)">primary color</span>.
                  </p>
                  <BuiltWith placement="contained" />
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function BrandMark({ name, logo }: { name: string; logo: string | null }) {
  if (!logo) return <span className="text-sm">{name}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="h-7 w-auto max-w-[11rem] object-contain" />
  );
}

function AssetField({
  label,
  name,
  accept,
  hint,
  asset,
  frameClassName,
  square = false,
}: {
  label: string;
  name: string;
  accept: string;
  hint: string;
  asset: AssetController;
  frameClassName: string;
  square?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        {asset.url ? (
          <button type="button" onClick={asset.remove} className="text-xs text-muted-foreground hover:text-foreground">
            Remove
          </button>
        ) : null}
      </div>
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center overflow-hidden rounded-control border border-dashed border-border",
          square ? "size-16" : "h-16 w-full",
          frameClassName,
        )}
      >
        {asset.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt="" className="max-h-12 max-w-[80%] object-contain" />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
            <ImagePlus className="size-3.5" />
            Upload
          </span>
        )}
        <input
          ref={asset.inputRef}
          type="file"
          name={name}
          accept={accept}
          className="sr-only"
          onChange={(event) => asset.onFile(event.currentTarget.files?.[0])}
        />
      </label>
      <input type="hidden" name={`remove${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`} value={asset.removed ? "1" : "0"} />
      <input type="hidden" name={`${name}Chosen`} value={asset.url?.startsWith("blob:") ? "1" : "0"} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ChoiceGroup({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm">{legend}</legend>
      <div className={cn("grid gap-2", options.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-control border px-2 py-2 text-left text-sm",
                selected ? "border-foreground bg-muted" : "border-border hover:bg-muted/60",
              )}
            >
              <span className="block">{option.label}</span>
              {option.detail ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{option.detail}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type AssetController = ReturnType<typeof useAsset>;

function useAsset(saved: string | null) {
  const [url, setUrl] = useState<string | null>(saved);
  const [removed, setRemoved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const next = URL.createObjectURL(file);
    objectUrl.current = next;
    setUrl(next);
    setRemoved(false);
  }

  function remove() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setUrl(null);
    setRemoved(true);
  }

  return { url, removed, inputRef, onFile, remove };
}

function groupPages(pages: BrandingPreviewPage[]) {
  const groups: Array<{ section: string; items: BrandingPreviewPage[] }> = [];
  for (const page of pages) {
    const section = page.section || "Docs";
    const last = groups[groups.length - 1];
    if (!last || last.section !== section) groups.push({ section, items: [page] });
    else last.items.push(page);
  }
  return groups;
}

function uniqueColors(colors: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const color of colors) {
    const key = color.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(color);
  }
  return result;
}

function normalizeColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toLowerCase() : "#171717";
}

function subscribeToColorScheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function prefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
