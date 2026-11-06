import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { HAIRLINE, INK, MUTED, brandPrimary } from "@/lib/brand";
import type { OgParams } from "@/lib/og/sign";

export async function renderOgImage(params: OgParams): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(<OgCard params={params} />, {
    width: 1200,
    height: 630,
    fonts,
    headers: {
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

function OgCard({ params }: { params: OgParams }) {
  const lines = [];
  for (let x = 0; x <= 1200; x += 60) lines.push({ x1: x, y1: 0, x2: x, y2: 630, key: `v${x}` });
  for (let y = 0; y <= 630; y += 60) lines.push({ x1: 0, y1: y, x2: 1200, y2: y, key: `h${y}` });
  const initial = params.siteName.slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        position: "relative",
        background: "#FAFAFA",
        color: INK,
        fontFamily: "Geist",
      }}
    >
      {params.background ? (
        // Satori renders this social image and only accepts a plain img.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={params.background}
          width={1200}
          height={630}
          style={{ position: "absolute", width: 1200, height: 630, objectFit: "cover" }}
        />
      ) : (
        <svg width="1200" height="630" style={{ position: "absolute" }}>
          {lines.map((line) => (
            <line
              key={line.key}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={HAIRLINE}
              strokeWidth="1"
            />
          ))}
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          right: -120,
          top: -160,
          width: 560,
          height: 560,
          borderRadius: 560,
          background: params.primary || brandPrimary(),
          opacity: 0.16,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          margin: params.background ? 48 : 0,
          padding: 72,
          width: params.background ? 1104 : 1200,
          height: params.background ? 534 : 630,
          background: params.background ? "rgba(250,250,250,0.94)" : "transparent",
          borderRadius: params.background ? 28 : 0,
          border: params.background ? `1px solid ${HAIRLINE}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {params.logo ? (
            // Satori renders this social image and only accepts a plain img.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={params.logo}
              width={48}
              height={48}
              style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: params.primary,
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 500,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500 }}>
            {params.siteName} Docs
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
          {params.section ? (
            <div
              style={{
                display: "flex",
                fontFamily: "Geist Mono",
                fontSize: 18,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: params.primary,
              }}
            >
              {params.section}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              width: 960,
              fontSize: 64,
              fontWeight: 500,
              lineHeight: 1.05,
              letterSpacing: -1.6,
            }}
          >
            {params.title}
          </div>
          {params.description ? (
            <div style={{ display: "flex", fontSize: 28, lineHeight: 1.35, color: MUTED }}>
              {params.description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function loadFonts() {
  const root = path.join(process.cwd(), "node_modules/geist/dist/fonts");
  const [regular, medium, mono] = await Promise.all([
    readFile(path.join(root, "geist-sans/Geist-Regular.ttf")),
    readFile(path.join(root, "geist-sans/Geist-Medium.ttf")),
    readFile(path.join(root, "geist-mono/GeistMono-Regular.ttf")),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const },
  ];
}
