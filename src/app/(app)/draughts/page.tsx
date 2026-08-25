import type { Metadata } from "next";
import DraughtsClient from "./draughts-client";

export const metadata: Metadata = {
  title: "International Checkers (10×10) — Play Draughts Online",
  description: "Play International Checkers (10×10 draughts) on Crazy Chess Battles. Challenge the computer or other players in classic 10×10 draughts games.",
  alternates: { canonical: "https://crazychessbattles.live/draughts" },
};

export default function DraughtsPage() {
  return <DraughtsClient />;
}
