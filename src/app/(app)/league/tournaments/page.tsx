import type { Metadata } from "next";
import TournamentsClient from "./tournaments-client";

export const metadata: Metadata = {
  title: "Chess Tournaments — Browse & Enter Competitions",
  description: "Browse all active and upcoming chess tournaments on Crazy Chess Battles. Find open tournaments, check entry requirements, and register to compete for prizes.",
  alternates: { canonical: "https://crazychessbattles.live/league/tournaments" },
};

export default function TournamentsPage() {
  return <TournamentsClient />;
}
