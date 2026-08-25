import type { Metadata } from "next";
import MatchdayClient from "./matchday-client";

export const metadata: Metadata = {
  title: "Matchday — League Fixtures & Results",
  description: "View matchday fixtures and results for Crazy Chess Battles league competitions.",
};

export default function MatchdayPage({ params }: { params: Promise<{ number: string }> }) {
  return <MatchdayClient params={params} />;
}
