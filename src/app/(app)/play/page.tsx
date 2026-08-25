import type { Metadata } from "next";
import PlayClient from "./play-client";

export const metadata: Metadata = {
  title: "Play Chess — Blitz, Bullet & Rapid Games",
  description: "Play chess online on Crazy Chess Battles. Choose blitz, bullet, or rapid time controls. Challenge friends, play the computer, or match with random opponents.",
  alternates: { canonical: "https://crazychessbattles.live/play" },
};

export default function PlayPage() {
  return <PlayClient />;
}
