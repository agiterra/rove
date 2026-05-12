import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // No transpilation needed — eval-dashboard is intentionally standalone
  // (zero @rove/* imports) so it deploys to Vercel as a subdir without
  // pulling the monorepo with it.
  experimental: {},
};

export default config;
