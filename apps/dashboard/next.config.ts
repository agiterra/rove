import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // No transpilation needed — eval-dashboard is intentionally standalone
  // (zero @rove/* imports) so it deploys to Vercel as a subdir without
  // pulling the monorepo with it.
  experimental: {},
  async headers() {
    return [
      {
        // Tarballs are repacked on every Vercel build. Prevent edge caches from
        // serving a stale tarball after a release — a stale install would be a
        // silent bad state. no-cache forces a revalidation on every fetch while
        // still allowing CDN conditional GETs (If-None-Match) to avoid
        // re-downloading identical bytes.
        source: "/install/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default config;
