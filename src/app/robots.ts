import type { MetadataRoute } from "next";

const BASE_URL = "https://crazychessbattles.live";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/how-it-works",
          "/faq",
          "/leaderboard",
          "/league",
          "/tournaments",
          "/league/subscribe",
          "/draughts",
          "/login",
          "/signup",
          "/privacy",
          "/terms",
        ],
        disallow: [
          "/dashboard",
          "/settings",
          "/wallet",
          "/history",
          "/admin",
          "/api",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
