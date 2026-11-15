import type { NextConfig } from "next";

// Internal tool reading a local SQLite file: every page is rendered per request,
// so component caching is switched off on purpose.
const nextConfig: NextConfig = {
  cacheComponents: false,
  // CSV exports are uploaded through a Server Action.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
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
