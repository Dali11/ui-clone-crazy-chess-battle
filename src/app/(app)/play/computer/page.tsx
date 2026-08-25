import type { Metadata } from "next";

import { notFound } from "next/navigation";
import ComputerGameWrapper from "@/components/game/computer-game-wrapper";
import type { AIDifficulty } from "@/lib/game/chess-ai";
import { createClient } from "@/lib/supabase/server";

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_COLORS = ["white", "black"];


export const metadata: Metadata = {
  title: "Play Chess vs Computer — Practice & Train",
  description: "Practice chess against the AI on Crazy Chess Battles. Choose difficulty, sharpen your tactics, and improve your game.",
};

export default async function ComputerGamePage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string; color?: string; tc?: string }>;
}) {
  const params = await searchParams;
  const difficulty = (params.difficulty || "medium") as AIDifficulty;
  const color = (params.color || "white") as "white" | "black";

  if (!VALID_DIFFICULTIES.includes(difficulty) || !VALID_COLORS.includes(color)) {
    notFound();
  }

  const tc = params.tc || "blitz";
  const timeMap: Record<string, { minutes: number; increment: number }> = {
    bullet: { minutes: 1, increment: 0 },
    blitz3: { minutes: 3, increment: 2 },
    blitz: { minutes: 5, increment: 0 },
    rapid: { minutes: 10, increment: 0 },
    rapid15: { minutes: 15, increment: 10 },
    classical: { minutes: 30, increment: 0 },
  };
  const tcConfig = timeMap[tc] || timeMap.blitz;

  // Get current user (optional — can play as guest)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <ComputerGameWrapper
      difficulty={difficulty}
      playerColor={color}
      initialMinutes={tcConfig.minutes}
      incrementSeconds={tcConfig.increment}
      userId={user?.id || null}
    />
  );
}
