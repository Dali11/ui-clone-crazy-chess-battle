import type { Metadata } from "next";
import MatchClient from "./match-client";

export const metadata: Metadata = {
  title: "League Match — Live Chess Fixture",
  description: "View this league match fixture on Crazy Chess Battles. See players, schedule, and live game status.",
};

export default function MatchPage({ params }: { params: Promise<{ fixtureId: string }> }) {
  return <MatchClient params={params} />;
}
