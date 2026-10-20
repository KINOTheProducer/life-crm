import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Every app page reads the session, so only validate pages that opt in with `instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  transpilePackages: ["@life-crm/ai", "@life-crm/core", "@life-crm/dav", "@life-crm/db", "@life-crm/immich", "@life-crm/reminders"],
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
