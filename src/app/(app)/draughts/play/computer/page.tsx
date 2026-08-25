import { notFound } from "next/navigation";
import DraughtsComputerGameWrapper from "@/components/game/draughts-computer-game-wrapper";
import type { AIDifficulty } from "@/lib/game/draughts-ai";
import type { Variant } from "@/lib/game/draughts-engine";

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_COLORS = ["white", "black"];
const VALID_VARIANTS = ["international", "english", "russian"];

export default async function DraughtsComputerGamePage({
  searchParams,
}: {
  searchParams: Promise<{ difficulty?: string; color?: string; tc?: string; variant?: string }>;
}) {
  const params = await searchParams;
  const difficulty = (params.difficulty || "medium") as AIDifficulty;
  const color = (params.color || "white") as "white" | "black";
  const variant = (params.variant || "international") as Variant;

  if (!VALID_DIFFICULTIES.includes(difficulty) || !VALID_COLORS.includes(color) || !VALID_VARIANTS.includes(variant)) {
    notFound();
  }

  const tc = params.tc || "rapid";
  const timeMap: Record<string, { minutes: number; increment: number }> = {
    bullet: { minutes: 1, increment: 0 },
    blitz: { minutes: 5, increment: 0 },
    rapid: { minutes: 10, increment: 0 },
  };
  const tcConfig = timeMap[tc] || timeMap.rapid;

  return (
    <DraughtsComputerGameWrapper
      difficulty={difficulty}
      playerColor={color}
      initialMinutes={tcConfig.minutes}
      incrementSeconds={tcConfig.increment}
      variant={variant}
    />
  );
}
