import type { Metadata } from "next";
import BattlesClient from "./battles-client";

export const metadata: Metadata = {
  title: "Chess Battles — Create & Join Stakes Matches",
  description: "Create or join chess battles on Crazy Chess Battles. Set time controls, choose opponents, and compete in head-to-head matches.",
  alternates: { canonical: "https://crazychessbattles.live/battles" },
};

export default function BattlesPage() {
  return <BattlesClient />;
}
