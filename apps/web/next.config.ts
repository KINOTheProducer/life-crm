import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // CardDAV collections end in a slash and clients expect them to stay that way. The proxy
  // strips trailing slashes from everything else.
  skipTrailingSlashRedirect: true,
  experimental: {
    // Business card photos; the browser shrinks them first, so this is a ceiling, not the norm.
    serverActions: { bodySizeLimit: "8mb" },
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
