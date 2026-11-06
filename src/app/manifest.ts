import type { MetadataRoute } from "next";
import { brandPrimary, MARK_WHITE_ON_BLACK, productName } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  const name = productName();
  return {
    name,
    short_name: name,
    id: "/",
    description: "Hosted docs and a Changelog for GitHub repos.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: MARK_WHITE_ON_BLACK, type: "image/png", purpose: "any" }],
  };
}
