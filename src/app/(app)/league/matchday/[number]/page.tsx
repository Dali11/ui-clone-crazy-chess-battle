import type { Metadata } from "next";
import MatchdayClient from "./matchday-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "League Matchday — Fixtures & Results",
  description: "View matchday fixtures and results on Crazy Chess Battles league.",
  path: "/league/matchday"
});

export default function MatchdayPage({ params }: { params: Promise<{ number: string }> }) {
  return <MatchdayClient params={params} />;
}
