import type { Metadata } from "next";
import LeagueClient from "./league-client";

export const metadata: Metadata = {
  title: "Chess Leagues & Tournaments — Compete and Win",
  description: "Join competitive chess leagues and tournaments on Crazy Chess Battles. Enter ranked competitions, climb divisions, and win prizes. Browse active and upcoming tournaments.",
  alternates: { canonical: "https://crazychessbattles.live/league" },
};

export default function LeaguePage() {
  return <LeagueClient />;
}
