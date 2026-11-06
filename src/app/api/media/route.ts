import { get } from "@vercel/blob";
import { getPrisma } from "@/lib/db";
import { isBlobUrl } from "@/lib/media/public-url";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isBlobUrl(url)) return new Response(null, { status: 400 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response(null, { status: 404 });
  const prisma = getPrisma();
  if (!prisma) return new Response(null, { status: 404 });
  const [site, user] = await Promise.all([
    prisma.site.findFirst({
      where: {
        OR: [
          { logoLightUrl: url },
          { logoDarkUrl: url },
          { faviconUrl: url },
          { ogBackgroundUrl: url },
          { ogImageUrl: url },
          { pages: { some: { ogImageUrl: url } } },
        ],
      },
      select: { id: true },
    }),
    prisma.user.findFirst({ where: { imageUrl: url }, select: { id: true } }),
  ]);
  if (!site && !user) return new Response(null, { status: 404 });
  const result = await get(url, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) return new Response(null, { status: 404 });
  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
