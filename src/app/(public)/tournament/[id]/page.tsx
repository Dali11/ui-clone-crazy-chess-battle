import type { Metadata } from "next";
import TournamentClient from "./tournament-client";

export const metadata: Metadata = {
  title: "Tournament Details — Chess Competition",
  description: "View tournament details, participants, brackets, and results on Crazy Chess Battles.",
  robots: { index: true, follow: true },
};

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  return <TournamentClient params={params} />;
}
