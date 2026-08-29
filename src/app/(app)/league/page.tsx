import type { Metadata } from "next";
import LeagueClient from "./league-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Chess Leagues — Competitive Seasons",
  description: "Join chess leagues on Crazy Chess Battles. Compete in seasonal leagues, climb divisions, and prove your rank.",
  path: "/league",
});

export default function LeaguePage() {
  return <LeagueClient />;
}
