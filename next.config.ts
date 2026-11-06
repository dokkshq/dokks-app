import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stay off. Dashboard, admin, and docs pages read
  // cookies, the host, and the database on each request.
  // 127.0.0.1 is a different dev origin from localhost. Without this,
  // Next blocks the dev client and clicks (the mobile menu) do nothing.
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: {
    // Profile and branding uploads are capped at 2 MB each. Branding can
    // send a light logo, a dark logo, and a favicon in one save.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
