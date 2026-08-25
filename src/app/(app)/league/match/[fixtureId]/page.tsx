import type { Metadata } from "next";
import MatchClient from "./match-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "League Match — Fixture Details",
  description: "View league match fixture details on Crazy Chess Battles.",
  path: "/league/match"
});

export default function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  return <MatchClient params={params} />;
}
