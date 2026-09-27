import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove X-Powered-By header for security + slight perf
  poweredByHeader: false,

  // Compress responses (usually on by default in Vercel, but explicit)
  compress: true,

  // Docker/standalone build for self-hosting (Coolify). Vercel builds do not
  // set DOCKER_BUILD, so their output is completely unchanged.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  // App lives in src/app
  // WebSocket connections will go to play.crazychessbattles.com (added later)

  // This app is fully live/dynamic — wallet balances, ratings, games played,
  // clocks, etc. must never be served from a stale cache. Disable Next's
  // client-side Router Cache (which by default keeps a navigated-away page's
  // data fresh for up to 30s) so every tab switch re-fetches current data.
  // Mirrors the headers block in vercel.json so the self-hosted build serves
  // the same PWA/service-worker headers Vercel does. Identical values, so
  // Vercel deployments are unaffected (vercel.json still applies there).
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },

  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
